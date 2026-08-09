export interface GeminiConfig {
  apiKey?: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  maxToolIterations: number;
  isMockMode: boolean;
}

export class GeminiConfigValidator {
  static validate(customConfig?: Partial<GeminiConfig>): GeminiConfig {
    const apiKey = customConfig?.apiKey || process.env.GEMINI_API_KEY;
    const model = customConfig?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const temperature = customConfig?.temperature ?? (process.env.GEMINI_TEMPERATURE ? parseFloat(process.env.GEMINI_TEMPERATURE) : 0.2);
    const maxOutputTokens = customConfig?.maxOutputTokens ?? (process.env.GEMINI_MAX_OUTPUT_TOKENS ? parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS, 10) : 2048);
    const timeoutMs = customConfig?.timeoutMs ?? (process.env.GEMINI_TIMEOUT_MS ? parseInt(process.env.GEMINI_TIMEOUT_MS, 10) : 30000);
    const maxToolIterations = customConfig?.maxToolIterations ?? (process.env.MAX_TOOL_ITERATIONS ? parseInt(process.env.MAX_TOOL_ITERATIONS, 10) : 3);
    
    // If mock mode is explicitly set OR if apiKey is missing, enable mock mode
    const isMockMode = customConfig?.isMockMode ?? (process.env.GEMINI_MOCK_MODE === 'true' || !apiKey);

    return {
      apiKey,
      model,
      temperature,
      maxOutputTokens,
      timeoutMs,
      maxToolIterations,
      isMockMode,
    };
  }
}
