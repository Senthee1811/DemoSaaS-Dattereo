import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The platform's own provider keys (OPENAI_API_KEY, ...) may only be used for
 * tenant traffic when explicitly enabled for local development. In production
 * this is always off, so a project without its own key can never bill the platform.
 */
export function platformProviderKeyAllowed(): boolean {
  return process.env.ALLOW_PLATFORM_PROVIDER_KEY === 'true' && process.env.NODE_ENV !== 'production';
}

export function missingProviderKeyError(providerLabel: string): HttpException {
  return new HttpException(
    {
      error: {
        message: `${providerLabel} API key is not configured for this project. Add your ${providerLabel} key in Project Settings -> Key Vault.`,
        type: 'provider_key_not_configured',
        code: 'missing_provider_key',
      },
    },
    HttpStatus.BAD_REQUEST,
  );
}

/**
 * Returns the key to send upstream: the project's decrypted key when it passes
 * `isUsable`, otherwise (dev opt-in only) the platform env key, otherwise throws
 * 400 missing_provider_key.
 */
export function resolveProviderKey(
  providerLabel: string,
  decryptedKey: string | undefined,
  envVar: string,
  isUsable: (key: string) => boolean,
): string {
  if (decryptedKey && isUsable(decryptedKey)) return decryptedKey;

  if (platformProviderKeyAllowed()) {
    const platformKey = process.env[envVar];
    if (platformKey && isUsable(platformKey)) return platformKey;
  }

  throw missingProviderKeyError(providerLabel);
}
