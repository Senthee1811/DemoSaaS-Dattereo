import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'spendguard-ai-master-secret-key-32b!'; // 32 chars
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

/**
 * Encrypts a plaintext string (e.g. OpenAI / Gemini / Claude API key)
 */
export function encryptApiKey(plainKey: string): string {
  if (!plainKey) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted key string
 */
export function decryptApiKey(encryptedPayload: string): string {
  if (!encryptedPayload || !encryptedPayload.includes(':')) return '';
  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) return '';
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt API key:', err);
    return '';
  }
}

/**
 * Generates a masked preview of an API key (e.g. sk-proj-...38aF)
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  const prefix = key.slice(0, 7);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Generates a secure SpendGuard Gateway API token
 */
export function generateGatewayToken(projectId: string): { token: string; prefix: string; hashedSecret: string } {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const token = `sg_live_${randomBytes}`;
  const prefix = token.slice(0, 15);
  const hashedSecret = crypto.createHash('sha256').update(token).digest('hex');
  return { token, prefix, hashedSecret };
}

/**
 * Hashes a token to verify incoming requests
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
