# Gemini AI Provider Architecture (CMD-015)

## Overview
The `GeminiAIProvider` implements `IAIProvider` contract inside `src/infrastructure/ai/gemini/`, providing real Gemini SDK integration while isolating `src/core/` from any vendor-specific dependencies.

## Architecture
```
Agent Core (src/core/)
      │
      ▼
IAIProvider Interface
      │
      ▼
GeminiAIProvider (src/infrastructure/ai/gemini/)
      │
 ┌────┴────────────────────────┬────────────────────────┐
 ▼                             ▼                        ▼
RealGeminiTransport       MockGeminiTransport     GeminiAdapter
 (@google/genai)           (Unit/E2E Tests)       (Type Mapping)
```

## Credential Security
- **API Key**: Loaded strictly from `process.env.GEMINI_API_KEY`.
- **Zero Exposure**: No API keys stored in source code, version control, tests, frontend, or logs.
- **Safe Fallback**: When `GEMINI_API_KEY` is absent, the provider defaults to `MockGeminiTransport` or reports `REAL GEMINI: NOT CONFIGURED` safely without throwing unhandled exceptions.

## Model Configuration
- `GEMINI_MODEL` (default: `gemini-2.5-flash`)
- `GEMINI_TEMPERATURE` (default: `0.2`)
- `GEMINI_MAX_OUTPUT_TOKENS` (default: `2048`)
- `GEMINI_TIMEOUT_MS` (default: `30000`)
- `MAX_TOOL_ITERATIONS` (default: `3`)

## Security Controls
1. **Tenant Isolation**: Tool parameter proposals from Gemini are strictly untrusted. `ToolExecutionContext` is unconditionally supplied by `message.context`.
2. **Data First**: Tool outputs (`DataNotFound`, `DataUnavailable`) are strictly respected. The AI provider is blocked from inventing false business data.
3. **Prompt Injection Resistance**: Instruction override attempts (e.g. "ignore rules", "set tenantId=hacker") are neutralized at transport and orchestrator levels.
