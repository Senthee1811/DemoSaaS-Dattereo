import { siAnthropic, siGooglegemini, siOpenai } from 'simple-icons';

/**
 * THE one place a provider is defined on the frontend.
 *
 * Adding a provider = one entry here (plus its adapter and enum value on the backend). The
 * Key Vault and onboarding selectors, the Test Bench filter, the logos, key placeholders,
 * chart colours and the provider names inside UI copy all read from this array.
 *
 * `id` is the backend's provider enum string exactly (ProviderType in prisma/schema.prisma,
 * what the adapters and pricing catalog use), so selections go to the API with no translation.
 */
export interface ProviderDef {
  id: string;
  /** Display name. Display only: never sent to the API. */
  label: string;
  /** One line for pickers: what the provider serves. */
  desc: string;
  /** Example of the provider's key format, shown as the input placeholder. */
  keyPlaceholder: string;
  /** simple-icons icon (e.g. siOpenai). Omit when simple-icons has no mark: a plain monogram is shown. */
  icon?: { path: string };
  /** Recognises this provider's model ids, for chart colours. Optional. */
  modelPattern?: RegExp;
  /** Chart colours for this provider's models. Optional: a neutral grey is used without them. */
  chartShades?: readonly string[];
}

export const PROVIDERS = [
  {
    id: 'OPENAI',
    label: 'OpenAI',
    desc: 'GPT models',
    keyPlaceholder: 'sk-proj-...',
    icon: siOpenai,
    modelPattern: /^(gpt|o\d)/,
    chartShades: ['#FF6B35', '#FB923C', '#F97316', '#EA580C'],
  },
  {
    id: 'ANTHROPIC',
    label: 'Anthropic',
    desc: 'Claude models',
    keyPlaceholder: 'sk-ant-api03-...',
    icon: siAnthropic,
    modelPattern: /^claude/,
    chartShades: ['#2563EB', '#3B82F6', '#1D4ED8', '#60A5FA'],
  },
  {
    id: 'GEMINI',
    label: 'Gemini',
    desc: 'Gemini models',
    keyPlaceholder: 'AIzaSy...',
    icon: siGooglegemini,
    modelPattern: /^gemini/,
    chartShades: ['#0D9488', '#14B8A6', '#059669', '#2DD4BF'],
  },
  {
    id: 'GROQ',
    label: 'Groq',
    desc: 'Open models, fast',
    keyPlaceholder: 'gsk_...',
    // simple-icons (any version) has no Groq mark, so Groq shows the "G" monogram. To use the
    // official logo, add its SVG path here as `icon: { path: '...' }` (from Groq's brand kit).
    modelPattern: /^(llama-|meta-llama\/|openai\/|qwen\/|moonshotai\/|groq\/)/,
    chartShades: ['#7C3AED', '#8B5CF6', '#6D28D9', '#A78BFA'],
  },
] as const satisfies readonly ProviderDef[];

/** The provider ids the app knows (a union of the registry's ids). */
export type ProviderId = (typeof PROVIDERS)[number]['id'];

export const DEFAULT_PROVIDER_ID: ProviderId = PROVIDERS[0].id;

/** Loose view for code that must also accept ids not known at compile time (API data, tests). */
const ALL: readonly ProviderDef[] = PROVIDERS;

/** Accepts the API enum ('GEMINI') or lower case ('gemini'). */
export function getProvider(id: string | null | undefined): ProviderDef | undefined {
  const key = (id || '').toUpperCase();
  return ALL.find((p) => p.id === key);
}

export function providerLabel(id: string): string {
  return getProvider(id)?.label ?? id;
}

export function providerKeyPlaceholder(id: string): string {
  return getProvider(id)?.keyPlaceholder ?? '';
}

/** "OpenAI, Anthropic, Gemini and Groq": for UI copy, so a new provider appears in sentences too. */
export function providerNames(conjunction: 'and' | 'or' = 'and'): string {
  const names = ALL.map((p) => p.label);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${conjunction} ${names[names.length - 1]}`;
}

/** The provider whose model ids look like `model`, if any. */
export function providerForModel(model: string): ProviderDef | undefined {
  const id = model.toLowerCase();
  return ALL.find((p) => p.modelPattern?.test(id));
}
