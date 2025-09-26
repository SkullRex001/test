export class TextPreprocessor {
  private readonly medicalTermCorrections = new Map([
    // Common OCR errors in medical terminology
    ['hemglobin', 'hemoglobin'],
    ['hemogoblin', 'hemoglobin'],
    ['haemoglobin', 'hemoglobin'],
    ['hgb', 'hemoglobin'],
    ['wbc', 'WBC'],
    ['rbc', 'RBC'],
    ['hct', 'hematocrit'],
    ['mcv', 'MCV'],
    ['mch', 'MCH'],
    ['mchc', 'MCHC'],
    ['rdw', 'RDW'],
    ['plt', 'platelets'],
    ['platlets', 'platelets'],
    ['platletes', 'platelets'],
    ['gluc', 'glucose'],
    ['glu', 'glucose'],
    ['chol', 'cholesterol'],
    ['cholestrol', 'cholesterol'],
    ['triglyce', 'triglycerides'],
    ['hdl', 'HDL'],
    ['ldl', 'LDL'],
    ['tsh', 'TSH'],
    ['t4', 'T4'],
    ['t3', 'T3'],
    ['bun', 'BUN'],
    ['creat', 'creatinine'],
    ['creatinin', 'creatinine'],
    ['alt', 'ALT'],
    ['ast', 'AST'],
    ['alp', 'ALP'],
    ['bil', 'bilirubin'],
    ['bilirub', 'bilirubin'],
    ['hgh', 'high'],
    ['hi', 'high'],
    ['hig', 'high'],
    ['lo', 'low'],
    ['lw', 'low'],
    ['norm', 'normal'],
    ['norma', 'normal'],
    ['g/dl', 'g/dL'],
    ['mg/dl', 'mg/dL'],
    ['ug/dl', 'ug/dL'],
    ['ul', 'uL'],
    ['/ul', '/uL'],
    ['mm3', '/uL'],
    ['cells/ul', '/uL'],
    ['10^3/ul', 'K/uL'],
    ['k/ul', 'K/uL'],
    ['m/ul', 'M/uL'],
    ['x10^3', 'K/uL'],
    ['x10^6', 'M/uL'],
  ]);

  private readonly unitNormalizations = new Map([
    ['g/dl', 'g/dL'],
    ['mg/dl', 'mg/dL'],
    ['ug/dl', 'ug/dL'],
    ['ng/dl', 'ng/dL'],
    ['pg/dl', 'pg/dL'],
    ['ul', 'uL'],
    ['/ul', '/uL'],
    ['mm3', '/uL'],
    ['cells/ul', '/uL'],
    ['10^3/ul', 'K/uL'],
    ['k/ul', 'K/uL'],
    ['m/ul', 'M/uL'],
    ['x10^3', 'K/uL'],
    ['x10^6', 'M/uL'],
    ['mm/hr', 'mm/hr'],
    ['mg/l', 'mg/L'],
    ['ug/l', 'ug/L'],
    ['ng/ml', 'ng/mL'],
    ['pg/ml', 'pg/mL'],
    ['iu/l', 'IU/L'],
    ['u/l', 'U/L'],
    ['mmol/l', 'mmol/L'],
    ['umol/l', 'umol/L'],
  ]);

  preprocessText(text: string): string {
    let processed = text.toLowerCase();
    
    // Fix common OCR spacing issues
    processed = processed.replace(/\s+/g, ' ').trim();
    
    // Fix medical term corrections
    Array.from(this.medicalTermCorrections.entries()).forEach(([error, correction]) => {
      const regex = new RegExp(`\\b${error}\\b`, 'gi');
      processed = processed.replace(regex, correction);
    });
    
    // Normalize units
    Array.from(this.unitNormalizations.entries()).forEach(([variant, standard]) => {
      const regex = new RegExp(`\\b${variant}\\b`, 'gi');
      processed = processed.replace(regex, standard);
    });
    
    // Fix common punctuation and formatting issues
    processed = processed.replace(/\(\s*(high|low|normal)\s*\)/gi, '($1)');
    processed = processed.replace(/\s*:\s*/g, ': ');
    processed = processed.replace(/\s*,\s*/g, ', ');
    
    // Remove extra whitespace
    processed = processed.replace(/\s+/g, ' ').trim();
    
    return processed;
  }

  extractTestsFromText(text: string): string[] {
    const preprocessed = this.preprocessText(text);
    const tests: string[] = [];
    
    // Pattern to match test results: TestName value unit (status)
    const testPattern = /([a-zA-Z0-9\s]+?)[\s:]+([0-9,\.]+)\s*([a-zA-Z\/\^\s\-]+?)(?:\s*\(([a-zA-Z\s]+)\))?/g;
    
    let match;
    while ((match = testPattern.exec(preprocessed)) !== null) {
      const [, testName, value, unit, status] = match;
      const cleanTestName = testName.trim();
      const cleanValue = value.replace(/,/g, '');
      const cleanUnit = unit.trim();
      const cleanStatus = status ? status.trim() : '';
      
      if (cleanTestName && cleanValue && cleanUnit) {
        const testString = `${cleanTestName} ${cleanValue} ${cleanUnit}${cleanStatus ? ` (${cleanStatus})` : ''}`;
        tests.push(testString.trim());
      }
    }
    
    // Fallback: split by common delimiters and clean up
    if (tests.length === 0) {
      const lines = preprocessed.split(/[,;|\n]/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && /\d/.test(trimmed)) {
          tests.push(trimmed);
        }
      }
    }
    
    return tests.filter(test => test.length > 0);
  }

  calculateConfidence(originalText: string, extractedTests: string[]): number {
    if (extractedTests.length === 0) return 0;
    
    const originalLower = originalText.toLowerCase();
    let matchingElements = 0;
    let totalElements = 0;
    
    for (const test of extractedTests) {
      const parts = test.split(/\s+/);
      for (const part of parts) {
        totalElements++;
        if (originalLower.includes(part.toLowerCase())) {
          matchingElements++;
        }
      }
    }
    
    const baseConfidence = totalElements > 0 ? matchingElements / totalElements : 0;
    
    // Adjust confidence based on number of tests found
    const testCountFactor = Math.min(extractedTests.length / 3, 1); // Optimal around 3 tests
    
    // Penalize if text seems corrupted (too many single characters)
    const corruptionPenalty = this.calculateCorruptionPenalty(originalText);
    
    return Math.max(0, Math.min(1, baseConfidence * testCountFactor * (1 - corruptionPenalty)));
  }
  
  private calculateCorruptionPenalty(text: string): number {
    const words = text.split(/\s+/);
    const singleCharWords = words.filter(word => word.length === 1).length;
    const totalWords = words.length;
    
    if (totalWords === 0) return 0.5;
    
    const singleCharRatio = singleCharWords / totalWords;
    return Math.min(singleCharRatio * 2, 0.5); // Max penalty of 50%
  }
}

export const textPreprocessor = new TextPreprocessor();
