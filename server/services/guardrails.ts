import { openaiService } from './openai';
import { NormalizedTest, ErrorOutput } from '@shared/schema';
import { medicalTestNormalizer } from './normalizer';

export class GuardrailService {
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.7;
  private readonly MAX_TESTS_PER_REPORT = 20;
  private readonly MIN_TESTS_PER_REPORT = 1;

  async validateProcessing(
    originalInput: string,
    extractedTests: string[],
    normalizedTests: NormalizedTest[],
    confidence: number
  ): Promise<{ valid: true } | { valid: false; error: ErrorOutput }> {
    
    // Check confidence threshold
    if (confidence < this.MIN_CONFIDENCE_THRESHOLD) {
      return {
        valid: false,
        error: {
          status: "unprocessed",
          reason: `confidence score ${confidence.toFixed(2)} below minimum threshold of ${this.MIN_CONFIDENCE_THRESHOLD}`,
          details: {
            confidence_score: confidence,
            minimum_required: this.MIN_CONFIDENCE_THRESHOLD
          },
          timestamp: new Date().toISOString()
        }
      };
    }

    // Check test count limits
    if (normalizedTests.length > this.MAX_TESTS_PER_REPORT) {
      return {
        valid: false,
        error: {
          status: "unprocessed",
          reason: `too many tests detected (${normalizedTests.length}), maximum allowed is ${this.MAX_TESTS_PER_REPORT}`,
          details: {
            detected_tests: normalizedTests.length,
            maximum_allowed: this.MAX_TESTS_PER_REPORT
          },
          timestamp: new Date().toISOString()
        }
      };
    }

    if (normalizedTests.length < this.MIN_TESTS_PER_REPORT) {
      return {
        valid: false,
        error: {
          status: "unprocessed",
          reason: "no valid medical tests detected in input",
          details: {
            detected_tests: normalizedTests.length,
            minimum_required: this.MIN_TESTS_PER_REPORT
          },
          timestamp: new Date().toISOString()
        }
      };
    }

    // Check for hallucinations using OpenAI validation
    try {
      const isValid = await openaiService.validateTestsAgainstInput(originalInput, extractedTests);
      if (!isValid) {
        const hallucinatedTests = await this.detectHallucinatedTests(originalInput, normalizedTests);
        return {
          valid: false,
          error: {
            status: "unprocessed",
            reason: "hallucinated tests not present in input",
            details: {
              detected_hallucinations: hallucinatedTests,
              original_tests: extractedTests,
              confidence_score: confidence
            },
            timestamp: new Date().toISOString()
          }
        };
      }
    } catch (error) {
      console.error('Hallucination detection failed:', error);
      return {
        valid: false,
        error: {
          status: "unprocessed",
          reason: "validation system error",
          details: {
            error_message: error instanceof Error ? error.message : String(error),
            confidence_score: confidence
          },
          timestamp: new Date().toISOString()
        }
      };
    }

    // Check for suspicious value patterns
    const suspiciousValues = this.detectSuspiciousValues(normalizedTests);
    if (suspiciousValues.length > 0) {
      return {
        valid: false,
        error: {
          status: "unprocessed",
          reason: "suspicious or impossible test values detected",
          details: {
            suspicious_values: suspiciousValues,
            confidence_score: confidence
          },
          timestamp: new Date().toISOString()
        }
      };
    }

    return { valid: true };
  }

  private async detectHallucinatedTests(originalInput: string, normalizedTests: NormalizedTest[]): Promise<string[]> {
    const originalLower = originalInput.toLowerCase();
    const hallucinated: string[] = [];

    // Create a reverse mapping from normalized names to possible variants
    const testVariants = new Map([
      ['Hemoglobin', ['hemoglobin', 'hgb', 'haemoglobin']],
      ['WBC', ['wbc', 'white blood cells', 'white blood cell count', 'leukocytes']],
      ['RBC', ['rbc', 'red blood cells', 'red blood cell count', 'erythrocytes']],
      ['Platelets', ['platelets', 'plt', 'platelet count', 'thrombocytes']],
      ['Hematocrit', ['hematocrit', 'hct', 'haematocrit']],
      ['Glucose', ['glucose', 'blood glucose', 'blood sugar', 'glu']],
      ['Total Cholesterol', ['cholesterol', 'total cholesterol', 'chol']],
      ['HDL Cholesterol', ['hdl', 'hdl cholesterol', 'high density lipoprotein']],
      ['LDL Cholesterol', ['ldl', 'ldl cholesterol', 'low density lipoprotein']],
      ['Triglycerides', ['triglycerides', 'tg', 'trigs']],
      ['Creatinine', ['creatinine', 'creat', 'serum creatinine']],
      ['BUN', ['bun', 'blood urea nitrogen', 'urea']],
      ['ALT', ['alt', 'alanine aminotransferase', 'sgpt']],
      ['AST', ['ast', 'aspartate aminotransferase', 'sgot']],
      ['ALP', ['alp', 'alkaline phosphatase']],
      ['Total Bilirubin', ['bilirubin', 'total bilirubin', 'bil']],
      ['TSH', ['tsh', 'thyroid stimulating hormone']],
      ['T4', ['t4', 'thyroxine', 'free t4']],
      ['T3', ['t3', 'triiodothyronine', 'free t3']],
    ]);

    for (const test of normalizedTests) {
      const variants = testVariants.get(test.name) || [test.name.toLowerCase()];
      const valueString = test.value.toString();
      const valueWithCommas = test.value.toLocaleString(); // Handle comma formatting
      
      // Check if any variant of the test name appears in original input
      const testNameFound = variants.some(variant => originalLower.includes(variant));
      
      // Check if the value appears (with or without comma formatting)
      const valueFound = originalLower.includes(valueString) || 
                        originalLower.includes(valueWithCommas) ||
                        originalLower.includes(valueString.replace('.', ''));
      
      if (!testNameFound || !valueFound) {
        hallucinated.push(test.name);
      }
    }

    return hallucinated;
  }

  private detectSuspiciousValues(tests: NormalizedTest[]): Array<{ test: string; value: number; reason: string }> {
    const suspicious: Array<{ test: string; value: number; reason: string }> = [];

    for (const test of tests) {
      // Check for impossible values based on medical knowledge
      if (test.value <= 0) {
        suspicious.push({
          test: test.name,
          value: test.value,
          reason: "negative or zero value impossible for this test"
        });
      }

      // Specific test validations
      switch (test.name) {
        case 'Hemoglobin':
          if (test.value > 25 || test.value < 1) {
            suspicious.push({
              test: test.name,
              value: test.value,
              reason: "value outside biologically possible range (1-25 g/dL)"
            });
          }
          break;

        case 'WBC':
          if (test.value > 100000 || test.value < 100) {
            suspicious.push({
              test: test.name,
              value: test.value,
              reason: "value outside biologically possible range (100-100,000 /uL)"
            });
          }
          break;

        case 'Glucose':
          if (test.value > 1000 || test.value < 10) {
            suspicious.push({
              test: test.name,
              value: test.value,
              reason: "value outside biologically possible range (10-1000 mg/dL)"
            });
          }
          break;

        case 'Total Cholesterol':
          if (test.value > 1000 || test.value < 50) {
            suspicious.push({
              test: test.name,
              value: test.value,
              reason: "value outside biologically possible range (50-1000 mg/dL)"
            });
          }
          break;

        case 'Creatinine':
          if (test.value > 20 || test.value < 0.1) {
            suspicious.push({
              test: test.name,
              value: test.value,
              reason: "value outside biologically possible range (0.1-20 mg/dL)"
            });
          }
          break;
      }
    }

    return suspicious;
  }

  validateInputFormat(inputType: string, data: string): { valid: true } | { valid: false; error: string } {
    if (!inputType || !data) {
      return {
        valid: false,
        error: "Missing required fields: input_type and data"
      };
    }

    if (!['text', 'image'].includes(inputType)) {
      return {
        valid: false,
        error: "input_type must be either 'text' or 'image'"
      };
    }

    if (inputType === 'text') {
      if (data.length < 10) {
        return {
          valid: false,
          error: "Text input too short, minimum 10 characters required"
        };
      }

      if (data.length > 10000) {
        return {
          valid: false,
          error: "Text input too long, maximum 10,000 characters allowed"
        };
      }
    }

    if (inputType === 'image') {
      // Basic base64 validation
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(data)) {
        return {
          valid: false,
          error: "Invalid base64 image data"
        };
      }

      // Check reasonable size limits (rough estimate)
      const sizeEstimate = (data.length * 3) / 4; // Convert base64 to bytes
      const maxSize = 10 * 1024 * 1024; // 10MB limit
      if (sizeEstimate > maxSize) {
        return {
          valid: false,
          error: "Image too large, maximum 10MB allowed"
        };
      }
    }

    return { valid: true };
  }
}

export const guardrailService = new GuardrailService();
