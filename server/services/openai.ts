import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key" 
});

export class OpenAIService {
  async extractTextFromImage(base64Image: string): Promise<{ text: string; confidence: number }> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are a medical OCR specialist. Extract all medical test results, values, and units from the image. Focus on accuracy and preserve all numerical values exactly. Return JSON with 'text' containing the extracted text and 'confidence' as a decimal between 0 and 1."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all medical test data from this image. Include test names, values, units, and status indicators (High/Low/Normal). Preserve exact formatting and numbers."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return {
        text: result.text || '',
        confidence: Math.max(0, Math.min(1, result.confidence || 0))
      };
    } catch (error) {
      throw new Error(`OCR extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generatePatientSummary(normalizedTests: any[]): Promise<{ summary: string; explanations: string[] }> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are a medical communication specialist. Create patient-friendly explanations of medical test results. Be clear, supportive, and educational without providing medical advice or diagnosis. Return JSON with 'summary' (brief overview) and 'explanations' (array of detailed explanations for each abnormal result)."
          },
          {
            role: "user",
            content: `Create a patient-friendly summary for these medical test results: ${JSON.stringify(normalizedTests)}. 

Guidelines:
- Use simple, non-medical language
- Explain what abnormal values might indicate generally
- Avoid specific diagnoses or medical advice
- Be reassuring but informative
- Focus only on the tests provided, do not add additional information`
          }
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return {
        summary: result.summary || '',
        explanations: result.explanations || []
      };
    } catch (error) {
      throw new Error(`Summary generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async validateTestsAgainstInput(originalInput: string, extractedTests: string[]): Promise<boolean> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are a medical data validator. Compare extracted test results against the original input to detect hallucinations. Return JSON with 'valid' (boolean) indicating if all extracted tests are present in the original input."
          },
          {
            role: "user",
            content: `Original input: "${originalInput}"
            
Extracted tests: ${JSON.stringify(extractedTests)}

Validate that ALL extracted tests are actually present in the original input. Return true only if every test can be found in the original text.`
          }
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.valid === true;
    } catch (error) {
      console.error('Validation failed:', error);
      return false; // Fail safe - reject if validation fails
    }
  }
}

export const openaiService = new OpenAIService();
