/**
 * Request attribution: which application / team (and any extra tags) a request's spend belongs to.
 *
 * Strategy (extensible without schema changes for future SDKs):
 *   1. A gateway key can carry `application` and/or `team`, set by whoever created the key (an org admin).
 *      That is AUTHORITATIVE: a client can never re-attribute spend made with that key to someone else's team.
 *   2. Otherwise the client may declare them with headers:
 *        X-SpendGuard-Application: support-bot
 *        X-SpendGuard-Team:        growth
 *        X-SpendGuard-Tags:        env=prod,feature=search        (up to 5; key=value)
 *   3. Anything missing or invalid stays NULL ("unattributed"). Nothing is inferred, defaulted or guessed, and an
 *      invalid tag never fails the request (it is ignored and reported in the response header).
 *
 * Values are normalised (trimmed, lower-cased) so "Support-Bot" and "support-bot" do not become two applications.
 */

export const TAG_VALUE_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
export const TAG_KEY_RE = /^[a-z][a-z0-9_.-]{0,31}$/;
export const MAX_CUSTOM_TAGS = 5;
const RESERVED_TAG_KEYS = new Set(['application', 'team']);

export interface Attribution {
  application: string | null;
  team: string | null;
  tags: Record<string, string> | null;
  /** Where each dimension came from, for audit. null = not attributed. */
  sources: { application: 'key' | 'header' | null; team: 'key' | 'header' | null };
  /** Human-readable reasons something supplied was not used (surfaced in a response header). */
  ignored: string[];
}

const normalise = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null);

export function resolveAttribution(input: {
  keyApplication?: string | null;
  keyTeam?: string | null;
  headerApplication?: unknown;
  headerTeam?: unknown;
  headerTags?: unknown;
}): Attribution {
  const ignored: string[] = [];

  const pick = (dimension: 'application' | 'team', keyValue: string | null | undefined, headerRaw: unknown): { value: string | null; source: 'key' | 'header' | null } => {
    const header = normalise(Array.isArray(headerRaw) ? headerRaw[0] : headerRaw);
    if (keyValue) {
      if (header && header !== keyValue) ignored.push(`${dimension} header ignored: the gateway key is assigned to "${keyValue}"`);
      return { value: keyValue, source: 'key' };
    }
    if (!header) return { value: null, source: null };
    if (!TAG_VALUE_RE.test(header)) {
      ignored.push(`${dimension} header ignored: use lowercase letters, digits and . _ : - (max 64 characters)`);
      return { value: null, source: null };
    }
    return { value: header, source: 'header' };
  };

  const app = pick('application', normalise(input.keyApplication), input.headerApplication);
  const team = pick('team', normalise(input.keyTeam), input.headerTeam);

  let tags: Record<string, string> | null = null;
  const rawTags = Array.isArray(input.headerTags) ? input.headerTags.join(',') : typeof input.headerTags === 'string' ? input.headerTags : '';
  if (rawTags.trim()) {
    const parsed: Record<string, string> = {};
    for (const part of rawTags.slice(0, 1000).split(',')) {
      if (!part.trim()) continue;
      const eq = part.indexOf('=');
      const k = eq > 0 ? part.slice(0, eq).trim().toLowerCase() : '';
      const v = eq > 0 ? part.slice(eq + 1).trim().toLowerCase() : '';
      if (!TAG_KEY_RE.test(k) || !TAG_VALUE_RE.test(v)) {
        ignored.push('a tag was ignored: expected key=value with lowercase letters, digits and . _ : -');
      } else if (RESERVED_TAG_KEYS.has(k)) {
        ignored.push(`tag "${k}" ignored: use the X-SpendGuard-${k === 'team' ? 'Team' : 'Application'} header`);
      } else if (Object.keys(parsed).length >= MAX_CUSTOM_TAGS && !(k in parsed)) {
        ignored.push(`tag "${k}" ignored: at most ${MAX_CUSTOM_TAGS} tags are kept`);
      } else {
        parsed[k] = v;
      }
    }
    tags = Object.keys(parsed).length ? parsed : null;
  }

  return { application: app.value, team: team.value, tags, sources: { application: app.source, team: team.source }, ignored };
}
