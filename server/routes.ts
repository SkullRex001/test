import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { medicalProcessor } from "./services/medical-processor";
import { textPreprocessor } from "./services/text-preprocessor";
import { medicalTestNormalizer } from "./services/normalizer";
import { openaiService } from "./services/openai";
import { guardrailService } from "./services/guardrails";
import { processRequestSchema, ocrResultSchema, normalizedTestsSchema } from "@shared/schema";
import multer from "multer";

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF files are allowed.'));
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

  // File upload OCR endpoint
  app.post("/api/v1/ocr/extract-file", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const base64Data = req.file.buffer.toString('base64');
      const result = await medicalProcessor.extractText({ 
        input_type: 'image', 
        data: base64Data 
      });
      
      if (!result) {
        return res.status(500).json({ error: "Failed to extract text from file" });
      }

      res.json(result);
    } catch (error) {
      console.error("File OCR error:", error);
      res.status(500).json({ error: "Internal server error during file processing" });
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

  // Complete processing pipeline with file upload
  app.post("/api/v1/process/complete-file", upload.single('file'), async (req, res) => {
    const startTime = Date.now();
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const base64Data = req.file.buffer.toString('base64');
      const request = { input_type: 'image' as const, data: base64Data };
      
      // Create medical report record
      const report = await storage.createMedicalReport({
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

  const httpServer = createServer(app);
  return httpServer;
}
