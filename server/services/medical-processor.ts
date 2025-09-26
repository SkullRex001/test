import { openaiService } from './openai';
import { textPreprocessor } from './text-preprocessor';
import { medicalTestNormalizer } from './normalizer';
import { guardrailService } from './guardrails';
import { 
  ProcessRequest, 
  OcrResult, 
  NormalizedTests, 
  PatientSummary, 
  FinalOutput, 
  ErrorOutput 
} from '@shared/schema';

export class MedicalProcessor {
  async processComplete(request: ProcessRequest): Promise<FinalOutput | ErrorOutput> {
    const startTime = Date.now();

    try {
      // Step 1: Input validation
      const inputValidation = guardrailService.validateInputFormat(request.input_type, request.data);
      if (!inputValidation.valid) {
        return {
          status: "unprocessed",
          reason: `Input validation failed: ${inputValidation.error}`,
          timestamp: new Date().toISOString()
        };
      }

      // Step 2: OCR/Text extraction
      const ocrResult = await this.extractText(request);
      if (!ocrResult) {
        return {
          status: "unprocessed",
          reason: "Failed to extract text from input",
          timestamp: new Date().toISOString()
        };
      }

      // Step 3: Normalize tests
      const normalizedTests = await this.normalizeTests(ocrResult.tests_raw, request.data);
      if (!normalizedTests || normalizedTests.tests.length === 0) {
        return {
          status: "unprocessed",
          reason: "No valid medical tests could be normalized",
          timestamp: new Date().toISOString()
        };
      }

      // Step 4: Guardrail validation
      const validation = await guardrailService.validateProcessing(
        request.data,
        ocrResult.tests_raw,
        normalizedTests.tests,
        Math.min(ocrResult.confidence, normalizedTests.normalization_confidence)
      );

      if (!validation.valid) {
        return validation.error;
      }

      // Step 5: Generate patient summary
      const patientSummary = await this.generatePatientSummary(normalizedTests.tests);
      if (!patientSummary) {
        return {
          status: "unprocessed",
          reason: "Failed to generate patient-friendly summary",
          timestamp: new Date().toISOString()
        };
      }

      // Step 6: Compile final output
      const processingTime = Date.now() - startTime;
      const finalConfidence = Math.min(ocrResult.confidence, normalizedTests.normalization_confidence);

      const finalOutput: FinalOutput = {
        tests: normalizedTests.tests,
        summary: patientSummary.summary,
        explanations: patientSummary.explanations,
        status: "ok",
        confidence: finalConfidence,
        processing_time: `${(processingTime / 1000).toFixed(1)}s`
      };

      return finalOutput;

    } catch (error) {
      console.error('Medical processing error:', error);
      return {
        status: "unprocessed",
        reason: `Processing error: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          error_type: error instanceof Error ? error.constructor.name : typeof error,
          processing_step: "unknown"
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  async extractText(request: ProcessRequest): Promise<OcrResult | null> {
    try {
      if (request.input_type === 'text') {
        // Process text input
        const preprocessedText = textPreprocessor.preprocessText(request.data);
        const extractedTests = textPreprocessor.extractTestsFromText(preprocessedText);
        const confidence = textPreprocessor.calculateConfidence(request.data, extractedTests);

        return {
          tests_raw: extractedTests,
          confidence: confidence
        };
      } else {
        // Process image input with OCR
        const ocrResponse = await openaiService.extractTextFromImage(request.data);
        const preprocessedText = textPreprocessor.preprocessText(ocrResponse.text);
        const extractedTests = textPreprocessor.extractTestsFromText(preprocessedText);
        
        // Combine OCR confidence with extraction confidence
        const extractionConfidence = textPreprocessor.calculateConfidence(ocrResponse.text, extractedTests);
        const combinedConfidence = (ocrResponse.confidence + extractionConfidence) / 2;

        return {
          tests_raw: extractedTests,
          confidence: combinedConfidence
        };
      }
    } catch (error) {
      console.error('Text extraction error:', error);
      return null;
    }
  }

  async normalizeTests(rawTests: string[], originalInput: string): Promise<NormalizedTests | null> {
    try {
      return medicalTestNormalizer.normalizeTests(rawTests, originalInput);
    } catch (error) {
      console.error('Normalization error:', error);
      return null;
    }
  }

  async generatePatientSummary(tests: any[]): Promise<PatientSummary | null> {
    try {
      return await openaiService.generatePatientSummary(tests);
    } catch (error) {
      console.error('Summary generation error:', error);
      return null;
    }
  }
}

export const medicalProcessor = new MedicalProcessor();
