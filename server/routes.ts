import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { medicalProcessor } from "./services/medical-processor";
import { textPreprocessor } from "./services/text-preprocessor";
import { medicalTestNormalizer } from "./services/normalizer";
import { openaiService } from "./services/openai";
import { guardrailService } from "./services/guardrails";
import { fileProcessor } from "./services/file-processor";
import { processRequestSchema, ocrResultSchema, normalizedTestsSchema, batchProcessRequestSchema } from "@shared/schema";
import multer from "multer";

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 
      'image/png', 
      'image/jpg', 
      'application/pdf',
      'application/dicom' // DICOM files
    ];
    
    // For application/octet-stream, check if it's actually a DICOM file
    if (file.mimetype === 'application/octet-stream') {
      // We'll validate DICOM signature in the processing step
      // For now, allow it through and let fileProcessor validate
      cb(null, true);
    } else if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, PDF, and DICOM files are allowed.'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    res.json({ 
      status: "online", 
      timestamp: new Date().toISOString(),
      version: "1.0.0"
    });
  });

  // Statistics endpoint
  app.get("/api/stats", async (req, res) => {
    try {
      const allReports = await storage.getMedicalReports(1000);
      const completedReports = await storage.getMedicalReportsByStatus("completed");
      const failedReports = await storage.getMedicalReportsByStatus("failed");
      const unprocessedReports = await storage.getMedicalReportsByStatus("unprocessed");
      
      const totalProcessed = allReports.length;
      const successCount = completedReports.length;
      const successRate = totalProcessed > 0 ? (successCount / totalProcessed) * 100 : 0;
      
      const avgConfidence = completedReports.length > 0 
        ? completedReports.reduce((sum, report) => sum + (report.confidence || 0), 0) / completedReports.length * 100
        : 0;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const errorsToday = failedReports.concat(unprocessedReports)
        .filter(report => report.createdAt && report.createdAt >= today).length;

      res.json({
        totalProcessed,
        successRate: `${successRate.toFixed(1)}%`,
        avgConfidence: `${avgConfidence.toFixed(1)}%`,
        errorsToday
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  });

  // OCR text extraction endpoint
  app.post("/api/v1/ocr/extract", async (req, res) => {
    try {
      const validation = processRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request format",
          details: validation.error.errors 
        });
      }

      const { input_type, data } = validation.data;
      
      const inputValidation = guardrailService.validateInputFormat(input_type, data);
      if (!inputValidation.valid) {
        return res.status(400).json({ error: inputValidation.error });
      }

      const result = await medicalProcessor.extractText({ input_type, data });
      if (!result) {
        return res.status(500).json({ error: "Failed to extract text" });
      }

      res.json(result);
    } catch (error) {
      console.error("OCR extraction error:", error);
      res.status(500).json({ error: "Internal server error during OCR extraction" });
    }
  });

  // File upload OCR endpoint - supports images, PDFs, and DICOM files
  app.post("/api/v1/ocr/extract-file", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log(`Processing file: ${req.file.originalname} (${req.file.mimetype})`);
      
      // Process different file types using the new file processor
      const fileResult = await fileProcessor.processFile(
        req.file.buffer, 
        req.file.originalname, 
        req.file.mimetype
      );
      
      // Parse extracted text to get proper tests array
      const testsRaw = fileResult.text ? 
        textPreprocessor.extractTestsFromText(fileResult.text) : 
        [];

      // Convert to standard OCR result format
      const result = {
        tests_raw: testsRaw,
        raw_text: fileResult.text, // Include full text for reference
        confidence: fileResult.confidence,
        file_type: fileResult.fileType,
        metadata: fileResult.metadata
      };

      res.json(result);
    } catch (error) {
      console.error("File processing error:", error);
      res.status(500).json({ 
        error: "Internal server error during file processing",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Medical test normalization endpoint
  app.post("/api/v1/tests/normalize", async (req, res) => {
    try {
      const { tests_raw, original_input } = req.body;
      
      if (!Array.isArray(tests_raw) || !original_input) {
        return res.status(400).json({ 
          error: "Invalid request. Required: tests_raw (array), original_input (string)" 
        });
      }

      const result = await medicalProcessor.normalizeTests(tests_raw, original_input);
      if (!result) {
        return res.status(500).json({ error: "Failed to normalize tests" });
      }

      res.json(result);
    } catch (error) {
      console.error("Normalization error:", error);
      res.status(500).json({ error: "Internal server error during normalization" });
    }
  });

  // Patient summary generation endpoint
  app.post("/api/v1/summary/generate", async (req, res) => {
    try {
      const { tests } = req.body;
      
      if (!Array.isArray(tests)) {
        return res.status(400).json({ 
          error: "Invalid request. Required: tests (array)" 
        });
      }

      const result = await medicalProcessor.generatePatientSummary(tests);
      if (!result) {
        return res.status(500).json({ error: "Failed to generate summary" });
      }

      res.json(result);
    } catch (error) {
      console.error("Summary generation error:", error);
      res.status(500).json({ error: "Internal server error during summary generation" });
    }
  });

  // Complete processing pipeline endpoint
  app.post("/api/v1/process/complete", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const validation = processRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request format",
          details: validation.error.errors 
        });
      }

      const request = validation.data;
      
      // Create medical report record
      const report = await storage.createMedicalReport({
        inputType: request.input_type,
        originalInput: request.data,
        status: "processing",
        ocrResults: null,
        normalizedTests: null,
        patientSummary: null,
        finalOutput: null,
        errorReason: null,
        confidence: null,
        processingTimeMs: null,
      });

      try {
        // Process the request
        const result = await medicalProcessor.processComplete(request);
        const processingTime = Date.now() - startTime;

        if (result.status === "ok") {
          // Update report with successful result
          await storage.updateMedicalReport(report.id, {
            status: "completed",
            finalOutput: result,
            confidence: result.confidence,
            processingTimeMs: processingTime,
          });
          
          res.json(result);
        } else {
          // Update report with error
          await storage.updateMedicalReport(report.id, {
            status: "unprocessed",
            errorReason: result.reason,
            processingTimeMs: processingTime,
          });
          
          res.status(422).json(result);
        }
      } catch (processingError) {
        const processingTime = Date.now() - startTime;
        await storage.updateMedicalReport(report.id, {
          status: "failed",
          errorReason: processingError instanceof Error ? processingError.message : String(processingError),
          processingTimeMs: processingTime,
        });
        
        throw processingError;
      }
    } catch (error) {
      console.error("Complete processing error:", error);
      res.status(500).json({ 
        status: "unprocessed",
        reason: "Internal server error",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Complete processing pipeline with file upload - supports images, PDFs, and DICOM files  
  app.post("/api/v1/process/complete-file", upload.single('file'), async (req, res) => {
    const startTime = Date.now();
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log(`Processing file for complete pipeline: ${req.file.originalname} (${req.file.mimetype})`);
      
      // Process the file to extract text
      const fileResult = await fileProcessor.processFile(
        req.file.buffer, 
        req.file.originalname, 
        req.file.mimetype
      );
      
      // Create request for medical processor using extracted text
      const request = { 
        input_type: 'text' as const, 
        data: fileResult.text || `[${fileResult.fileType} file processed with ${fileResult.confidence} confidence]` 
      };
      
      // Create medical report record
      const report = await storage.createMedicalReport({
        inputType: fileResult.fileType,
        originalInput: req.file.buffer.toString('base64'),
        status: "processing",
        ocrResults: null,
        normalizedTests: null,
        patientSummary: null,
        finalOutput: null,
        errorReason: null,
        confidence: null,
        processingTimeMs: null,
      });

      try {
        // Process the request
        const result = await medicalProcessor.processComplete(request);
        const processingTime = Date.now() - startTime;

        if (result.status === "ok") {
          // Update report with successful result
          await storage.updateMedicalReport(report.id, {
            status: "completed",
            finalOutput: result,
            confidence: result.confidence,
            processingTimeMs: processingTime,
          });
          
          res.json(result);
        } else {
          // Update report with error
          await storage.updateMedicalReport(report.id, {
            status: "unprocessed",
            errorReason: result.reason,
            processingTimeMs: processingTime,
          });
          
          res.status(422).json(result);
        }
      } catch (processingError) {
        const processingTime = Date.now() - startTime;
        await storage.updateMedicalReport(report.id, {
          status: "failed",
          errorReason: processingError instanceof Error ? processingError.message : String(processingError),
          processingTimeMs: processingTime,
        });
        
        throw processingError;
      }
    } catch (error) {
      console.error("Complete file processing error:", error);
      res.status(500).json({ 
        status: "unprocessed",
        reason: "Internal server error",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get medical reports
  app.get("/api/v1/reports", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const reports = await storage.getMedicalReports(limit, offset);
      res.json(reports);
    } catch (error) {
      console.error("Get reports error:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  // Get specific medical report
  app.get("/api/v1/reports/:id", async (req, res) => {
    try {
      const report = await storage.getMedicalReport(req.params.id);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      res.json(report);
    } catch (error) {
      console.error("Get report error:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  // Batch processing endpoint
  app.post("/api/v1/process/batch", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const validation = batchProcessRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid batch request format",
          details: validation.error.errors 
        });
      }

      const { reports, batch_id } = validation.data;
      const batchId = batch_id || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`Processing batch ${batchId} with ${reports.length} reports`);

      const results = [];
      let successful = 0;
      let failed = 0;

      // Process each report in the batch
      for (let i = 0; i < reports.length; i++) {
        const report = reports[i];
        console.log(`Processing report ${i + 1}/${reports.length} in batch ${batchId}`);
        
        try {
          // Create individual medical report record
          const dbReport = await storage.createMedicalReport({
            inputType: report.input_type,
            originalInput: report.data,
            status: "processing",
            ocrResults: null,
            normalizedTests: null,
            patientSummary: null,
            finalOutput: null,
            errorReason: null,
            confidence: null,
            processingTimeMs: null,
          });

          // Process the individual report
          const processingResult = await medicalProcessor.processComplete(report);
          const processingTime = Date.now() - startTime;

          if (processingResult.status === "ok") {
            // Update with successful result
            await storage.updateMedicalReport(dbReport.id, {
              status: "completed",
              finalOutput: processingResult,
              confidence: processingResult.confidence,
              processingTimeMs: processingTime,
            });
            
            results.push(processingResult);
            successful++;
          } else {
            // Update with error result
            await storage.updateMedicalReport(dbReport.id, {
              status: "unprocessed",
              errorReason: processingResult.reason,
              processingTimeMs: processingTime,
            });
            
            results.push(processingResult);
            failed++;
          }
        } catch (processingError) {
          console.error(`Error processing report ${i + 1} in batch ${batchId}:`, processingError);
          
          const errorResult = {
            status: "unprocessed" as const,
            reason: `Processing error: ${processingError instanceof Error ? processingError.message : String(processingError)}`,
            timestamp: new Date().toISOString()
          };
          
          results.push(errorResult);
          failed++;
        }
      }

      const totalProcessingTime = Date.now() - startTime;
      
      // Determine overall batch status
      let batchStatus: "completed" | "partial_failure" | "failed";
      if (failed === 0) {
        batchStatus = "completed";
      } else if (successful > 0) {
        batchStatus = "partial_failure";
      } else {
        batchStatus = "failed";
      }

      const batchResponse = {
        batch_id: batchId,
        total_reports: reports.length,
        successful,
        failed,
        processing_time: `${(totalProcessingTime / 1000).toFixed(1)}s`,
        results,
        status: batchStatus
      };

      console.log(`Batch ${batchId} completed: ${successful} successful, ${failed} failed`);
      res.json(batchResponse);
      
    } catch (error) {
      console.error("Batch processing error:", error);
      res.status(500).json({ 
        status: "unprocessed",
        reason: "Internal server error during batch processing",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Batch processing with file uploads
  app.post("/api/v1/process/batch-files", upload.array('files', 10), async (req, res) => {
    const startTime = Date.now();
    
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const files = req.files as Express.Multer.File[];
      const batchId = `batch_files_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`Processing file batch ${batchId} with ${files.length} files`);

      const results = [];
      let successful = 0;
      let failed = 0;

      // Process each file in the batch
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`Processing file ${i + 1}/${files.length} in batch ${batchId}: ${file.originalname}`);
        
        try {
          const base64Data = file.buffer.toString('base64');
          const request = { input_type: 'image' as const, data: base64Data };
          
          // Create individual medical report record
          const dbReport = await storage.createMedicalReport({
            inputType: 'image',
            originalInput: base64Data,
            status: "processing",
            ocrResults: null,
            normalizedTests: null,
            patientSummary: null,
            finalOutput: null,
            errorReason: null,
            confidence: null,
            processingTimeMs: null,
          });

          // Process the individual file
          const processingResult = await medicalProcessor.processComplete(request);
          const processingTime = Date.now() - startTime;

          if (processingResult.status === "ok") {
            // Update with successful result
            await storage.updateMedicalReport(dbReport.id, {
              status: "completed",
              finalOutput: processingResult,
              confidence: processingResult.confidence,
              processingTimeMs: processingTime,
            });
            
            results.push(processingResult);
            successful++;
          } else {
            // Update with error result
            await storage.updateMedicalReport(dbReport.id, {
              status: "unprocessed",
              errorReason: processingResult.reason,
              processingTimeMs: processingTime,
            });
            
            results.push(processingResult);
            failed++;
          }
        } catch (processingError) {
          console.error(`Error processing file ${i + 1} in batch ${batchId}:`, processingError);
          
          const errorResult = {
            status: "unprocessed" as const,
            reason: `File processing error: ${processingError instanceof Error ? processingError.message : String(processingError)}`,
            timestamp: new Date().toISOString()
          };
          
          results.push(errorResult);
          failed++;
        }
      }

      const totalProcessingTime = Date.now() - startTime;
      
      // Determine overall batch status
      let batchStatus: "completed" | "partial_failure" | "failed";
      if (failed === 0) {
        batchStatus = "completed";
      } else if (successful > 0) {
        batchStatus = "partial_failure";
      } else {
        batchStatus = "failed";
      }

      const batchResponse = {
        batch_id: batchId,
        total_reports: files.length,
        successful,
        failed,
        processing_time: `${(totalProcessingTime / 1000).toFixed(1)}s`,
        results,
        status: batchStatus
      };

      console.log(`File batch ${batchId} completed: ${successful} successful, ${failed} failed`);
      res.json(batchResponse);
      
    } catch (error) {
      console.error("Batch file processing error:", error);
      res.status(500).json({ 
        status: "unprocessed",
        reason: "Internal server error during batch file processing",
        timestamp: new Date().toISOString()
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
