import { NormalizedTest, NormalizedTests } from '@shared/schema';

export class MedicalTestNormalizer {
  private readonly testMappings = new Map([
    // Hemoglobin variants
    ['hemoglobin', 'Hemoglobin'],
    ['hgb', 'Hemoglobin'],
    ['haemoglobin', 'Hemoglobin'],
    
    // WBC variants
    ['wbc', 'WBC'],
    ['white blood cells', 'WBC'],
    ['white blood cell count', 'WBC'],
    ['leukocytes', 'WBC'],
    
    // RBC variants
    ['rbc', 'RBC'],
    ['red blood cells', 'RBC'],
    ['red blood cell count', 'RBC'],
    ['erythrocytes', 'RBC'],
    
    // Platelet variants
    ['platelets', 'Platelets'],
    ['plt', 'Platelets'],
    ['platelet count', 'Platelets'],
    ['thrombocytes', 'Platelets'],
    
    // Hematocrit variants
    ['hematocrit', 'Hematocrit'],
    ['hct', 'Hematocrit'],
    ['haematocrit', 'Hematocrit'],
    
    // Glucose variants
    ['glucose', 'Glucose'],
    ['blood glucose', 'Glucose'],
    ['blood sugar', 'Glucose'],
    ['glu', 'Glucose'],
    
    // Cholesterol variants
    ['cholesterol', 'Total Cholesterol'],
    ['total cholesterol', 'Total Cholesterol'],
    ['chol', 'Total Cholesterol'],
    
    // HDL variants
    ['hdl', 'HDL Cholesterol'],
    ['hdl cholesterol', 'HDL Cholesterol'],
    ['high density lipoprotein', 'HDL Cholesterol'],
    
    // LDL variants
    ['ldl', 'LDL Cholesterol'],
    ['ldl cholesterol', 'LDL Cholesterol'],
    ['low density lipoprotein', 'LDL Cholesterol'],
    
    // Triglycerides variants
    ['triglycerides', 'Triglycerides'],
    ['tg', 'Triglycerides'],
    ['trigs', 'Triglycerides'],
    
    // Creatinine variants
    ['creatinine', 'Creatinine'],
    ['creat', 'Creatinine'],
    ['serum creatinine', 'Creatinine'],
    
    // BUN variants
    ['bun', 'BUN'],
    ['blood urea nitrogen', 'BUN'],
    ['urea', 'BUN'],
    
    // Liver enzymes
    ['alt', 'ALT'],
    ['alanine aminotransferase', 'ALT'],
    ['sgpt', 'ALT'],
    ['ast', 'AST'],
    ['aspartate aminotransferase', 'AST'],
    ['sgot', 'AST'],
    ['alp', 'ALP'],
    ['alkaline phosphatase', 'ALP'],
    
    // Bilirubin
    ['bilirubin', 'Total Bilirubin'],
    ['total bilirubin', 'Total Bilirubin'],
    ['bil', 'Total Bilirubin'],
    
    // Thyroid
    ['tsh', 'TSH'],
    ['thyroid stimulating hormone', 'TSH'],
    ['t4', 'T4'],
    ['thyroxine', 'T4'],
    ['free t4', 'Free T4'],
    ['t3', 'T3'],
    ['triiodothyronine', 'T3'],
    ['free t3', 'Free T3'],
  ]);

  private readonly referenceRanges = new Map([
    ['Hemoglobin', { unit: 'g/dL', male: { low: 13.8, high: 17.2 }, female: { low: 12.1, high: 15.1 }, default: { low: 12.0, high: 16.0 } }],
    ['WBC', { unit: '/uL', default: { low: 4000, high: 11000 } }],
    ['RBC', { unit: 'M/uL', male: { low: 4.7, high: 6.1 }, female: { low: 4.2, high: 5.4 }, default: { low: 4.2, high: 5.4 } }],
    ['Platelets', { unit: 'K/uL', default: { low: 150, high: 450 } }],
    ['Hematocrit', { unit: '%', male: { low: 41.0, high: 50.0 }, female: { low: 36.0, high: 46.0 }, default: { low: 36.0, high: 46.0 } }],
    ['Glucose', { unit: 'mg/dL', default: { low: 70, high: 100 } }],
    ['Total Cholesterol', { unit: 'mg/dL', default: { low: 0, high: 200 } }],
    ['HDL Cholesterol', { unit: 'mg/dL', male: { low: 40, high: 999 }, female: { low: 50, high: 999 }, default: { low: 40, high: 999 } }],
    ['LDL Cholesterol', { unit: 'mg/dL', default: { low: 0, high: 100 } }],
    ['Triglycerides', { unit: 'mg/dL', default: { low: 0, high: 150 } }],
    ['Creatinine', { unit: 'mg/dL', male: { low: 0.74, high: 1.35 }, female: { low: 0.59, high: 1.04 }, default: { low: 0.6, high: 1.2 } }],
    ['BUN', { unit: 'mg/dL', default: { low: 6, high: 20 } }],
    ['ALT', { unit: 'U/L', male: { low: 10, high: 40 }, female: { low: 7, high: 35 }, default: { low: 7, high: 40 } }],
    ['AST', { unit: 'U/L', default: { low: 10, high: 40 } }],
    ['ALP', { unit: 'U/L', default: { low: 44, high: 147 } }],
    ['Total Bilirubin', { unit: 'mg/dL', default: { low: 0.3, high: 1.2 } }],
    ['TSH', { unit: 'mIU/L', default: { low: 0.27, high: 4.20 } }],
    ['T4', { unit: 'ug/dL', default: { low: 4.5, high: 12.0 } }],
    ['Free T4', { unit: 'ng/dL', default: { low: 0.82, high: 1.77 } }],
    ['T3', { unit: 'ng/dL', default: { low: 80, high: 200 } }],
    ['Free T3', { unit: 'pg/mL', default: { low: 2.0, high: 4.4 } }],
  ]);

  private readonly unitConversions = new Map([
    // Hemoglobin conversions
    ['g/dl', 'g/dL'],
    ['gm/dl', 'g/dL'],
    ['g%', 'g/dL'],
    
    // WBC conversions
    ['/ul', '/uL'],
    ['cells/ul', '/uL'],
    ['/mm3', '/uL'],
    ['cells/mm3', '/uL'],
    ['10^3/ul', 'K/uL'],
    ['x10^3/ul', 'K/uL'],
    ['k/ul', 'K/uL'],
    
    // General unit standardizations
    ['mg/dl', 'mg/dL'],
    ['ug/dl', 'ug/dL'],
    ['ng/dl', 'ng/dL'],
    ['pg/ml', 'pg/mL'],
    ['ng/ml', 'ng/mL'],
    ['ug/ml', 'ug/mL'],
    ['mg/l', 'mg/L'],
    ['u/l', 'U/L'],
    ['iu/l', 'IU/L'],
    ['miu/l', 'mIU/L'],
    ['mmol/l', 'mmol/L'],
    ['umol/l', 'umol/L'],
  ]);

  normalizeTests(rawTests: string[], originalInput: string): NormalizedTests {
    const normalizedTests: NormalizedTest[] = [];
    let totalConfidence = 0;
    let validTests = 0;

    for (const rawTest of rawTests) {
      try {
        const normalized = this.normalizeIndividualTest(rawTest);
        if (normalized) {
          normalizedTests.push(normalized);
          totalConfidence += this.calculateTestConfidence(rawTest, normalized, originalInput);
          validTests++;
        }
      } catch (error) {
        console.warn(`Failed to normalize test: ${rawTest}`, error);
      }
    }

    const averageConfidence = validTests > 0 ? totalConfidence / validTests : 0;

    return {
      tests: normalizedTests,
      normalization_confidence: Math.max(0, Math.min(1, averageConfidence))
    };
  }

  private normalizeIndividualTest(rawTest: string): NormalizedTest | null {
    // Parse the raw test string: "TestName value unit (status)"
    const testRegex = /^([a-zA-Z0-9\s]+?)\s+([0-9,\.]+)\s+([a-zA-Z\/\^\s\-]+?)(?:\s*\(([a-zA-Z\s]+)\))?$/;
    const match = rawTest.trim().match(testRegex);

    if (!match) {
      console.warn(`Could not parse test: ${rawTest}`);
      return null;
    }

    const [, testNameRaw, valueRaw, unitRaw, statusRaw] = match;
    
    // Normalize test name
    const testName = this.normalizeTestName(testNameRaw.trim());
    if (!testName) {
      console.warn(`Unknown test name: ${testNameRaw}`);
      return null;
    }

    // Parse value
    const value = parseFloat(valueRaw.replace(/,/g, ''));
    if (isNaN(value)) {
      console.warn(`Invalid value: ${valueRaw}`);
      return null;
    }

    // Normalize unit
    const unit = this.normalizeUnit(unitRaw.trim());
    
    // Get reference range
    const referenceInfo = this.referenceRanges.get(testName);
    if (!referenceInfo) {
      console.warn(`No reference range for test: ${testName}`);
      return null;
    }

    const refRange = referenceInfo.default;
    
    // Determine status
    let status: 'low' | 'normal' | 'high';
    if (statusRaw) {
      const statusLower = statusRaw.toLowerCase().trim();
      if (statusLower.includes('low') || statusLower.includes('l')) {
        status = 'low';
      } else if (statusLower.includes('high') || statusLower.includes('h')) {
        status = 'high';
      } else {
        status = 'normal';
      }
    } else {
      // Calculate status from value and reference range
      if (value < refRange.low) {
        status = 'low';
      } else if (value > refRange.high) {
        status = 'high';
      } else {
        status = 'normal';
      }
    }

    return {
      name: testName,
      value: value,
      unit: unit,
      status: status,
      ref_range: refRange
    };
  }

  private normalizeTestName(rawName: string): string | null {
    const cleanName = rawName.toLowerCase().trim();
    return this.testMappings.get(cleanName) || null;
  }

  private normalizeUnit(rawUnit: string): string {
    const cleanUnit = rawUnit.toLowerCase().trim();
    return this.unitConversions.get(cleanUnit) || rawUnit;
  }

  private calculateTestConfidence(rawTest: string, normalized: NormalizedTest, originalInput: string): number {
    let confidence = 0.7; // Base confidence

    // Check if test name appears in original input
    const originalLower = originalInput.toLowerCase();
    if (originalLower.includes(normalized.name.toLowerCase())) {
      confidence += 0.15;
    }

    // Check if value appears in original input
    if (originalLower.includes(normalized.value.toString())) {
      confidence += 0.1;
    }

    // Check if unit appears in original input
    if (originalLower.includes(normalized.unit.toLowerCase())) {
      confidence += 0.05;
    }

    return Math.min(1, confidence);
  }
}

export const medicalTestNormalizer = new MedicalTestNormalizer();
