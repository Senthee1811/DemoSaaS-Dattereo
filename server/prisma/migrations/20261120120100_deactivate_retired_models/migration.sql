
-- Models the providers have retired or shut down (OpenAI: 2026-10-23 shutdown list;
-- Anthropic: claude-3-* retired; Gemini: 2.0 shut down 2026-06-01, 1.5 long gone).
-- Deactivated rather than deleted so history stays intact; the gateway stops pricing
-- (and therefore stops accepting) them.
UPDATE "model_pricing"
SET "is_active" = false
WHERE "model" IN (
  'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini',
  'claude-3-5-sonnet', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229',
  'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-exp'
);
