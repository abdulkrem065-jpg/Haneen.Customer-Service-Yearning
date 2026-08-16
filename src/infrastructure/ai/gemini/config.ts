export const GEMINI_MODELS = {
  COMPLEX: 'gemini-2.5-pro',
  GENERAL: 'gemini-2.5-flash',
  FAST: 'gemini-2.5-flash',
} as const;

export type GeminiModelAlias = 'complex' | 'general' | 'fast' | string;

export interface GeminiConfig {
  apiKey?: string;
  model: string;
  temperature: number;
  maxOutputTokens?: number;
  timeoutMs: number;
  maxToolIterations: number;
  isMockMode: boolean;
  enableThinking?: boolean;
}

/**
 * Centralized Gemini model normalization helper.
 * Strips outer whitespace, removes single or double 'models/' prefixes required by @google/genai SDK,
 * resolves aliases ('complex', 'general', 'fast'), and ensures valid model ID format.
 */
export function normalizeGeminiModelName(rawModelName?: string): string {
  if (!rawModelName) return GEMINI_MODELS.GENERAL;
  let cleaned = rawModelName.trim();
  if (!cleaned) return GEMINI_MODELS.GENERAL;

  // Strip all leading 'models/' prefixes (case-insensitive) to prevent double-prefixing in @google/genai SDK
  while (/^models\//i.test(cleaned)) {
    cleaned = cleaned.replace(/^models\//i, '').trim();
  }

  if (!cleaned) return GEMINI_MODELS.GENERAL;

  const lower = cleaned.toLowerCase();
  if (lower === 'complex' || lower === 'pro') return GEMINI_MODELS.COMPLEX;
  if (lower === 'general' || lower === 'flash') return GEMINI_MODELS.GENERAL;
  if (lower === 'fast' || lower === 'lite') return GEMINI_MODELS.FAST;

  // Handle legacy preview aliases smoothly to valid canonical models
  if (lower.includes('3.1-pro') || lower.includes('1.5-pro')) return GEMINI_MODELS.COMPLEX;
  if (lower.includes('3.5-flash') || lower.includes('1.5-flash') || lower.includes('3.1-flash')) return GEMINI_MODELS.GENERAL;

  return cleaned;
}

export class GeminiConfigValidator {
  static resolveModel(modelName?: string): string {
    return normalizeGeminiModelName(modelName);
  }

  static validate(customConfig?: Partial<GeminiConfig>): GeminiConfig {
    const apiKey = customConfig?.apiKey || process.env.GEMINI_API_KEY;
    const rawModel = customConfig?.model || process.env.GEMINI_MODEL || GEMINI_MODELS.GENERAL;
    const model = this.resolveModel(rawModel);
    const temperature = customConfig?.temperature ?? (process.env.GEMINI_TEMPERATURE ? parseFloat(process.env.GEMINI_TEMPERATURE) : 0.2);
    
    // Enable high thinking by default for complex model or if explicitly requested
    const isComplexModel = model === GEMINI_MODELS.COMPLEX;
    const enableThinking = customConfig?.enableThinking ?? (process.env.GEMINI_ENABLE_THINKING === 'true' || isComplexModel);

    // Omit maxOutputTokens when high thinking is enabled as required by Gemini API guidelines
    let maxOutputTokens: number | undefined;
    if (!enableThinking) {
      maxOutputTokens = customConfig?.maxOutputTokens ?? (process.env.GEMINI_MAX_OUTPUT_TOKENS ? parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS, 10) : 2048);
    } else if (customConfig?.maxOutputTokens !== undefined) {
      maxOutputTokens = customConfig.maxOutputTokens;
    }

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
      enableThinking,
    };
  }
}
