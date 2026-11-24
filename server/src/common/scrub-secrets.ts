/**
 * Scrubs credential-shaped strings from text that may be logged or returned to a client
 * (PRD Step 13: "Scrub API keys and other secrets from all log output").
 *
 * `extraSecrets` are exact values (e.g. the provider key used for this very call) that are
 * removed even if they do not match a known key pattern.
 */
export function scrubSecrets(text: string, extraSecrets: Array<string | undefined> = []): string {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const secret of extraSecrets) {
    // Very short values would shred ordinary words; real keys are far longer.
    if (secret && secret.length >= 8) out = out.split(secret).join('***REDACTED***');
  }
  return out
    .replace(/sk-ant-[a-zA-Z0-9_-]{10,}/g, 'sk-ant-***REDACTED***')
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, 'sk-***REDACTED***')
    .replace(/gsk_[a-zA-Z0-9]{10,}/g, 'gsk_***REDACTED***')
    .replace(/AIzaSy[a-zA-Z0-9_-]{10,}/g, 'AIzaSy***REDACTED***')
    .replace(/sg_(live|test)_[a-zA-Z0-9]{10,}/g, 'sg_$1_***REDACTED***')
    .replace(/spnd_live_[a-zA-Z0-9]{10,}/g, 'spnd_live_***REDACTED***')
    .replace(/Bearer\s+[a-zA-Z0-9._-]{20,}/g, 'Bearer ***REDACTED***');
}
