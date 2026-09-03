import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 16;
  private readonly authTagLength = 16;
  private readonly masterKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.get<string>('encryptionMasterKey') || 'spendguard-master-encryption-key-32b!';
    this.masterKey = crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Encrypts plaintext API key using AES-256-GCM.
   * Returns format: iv:authTag:ciphertext (hex encoded)
   */
  encryptApiKey(plaintext: string): string {
    if (!plaintext) return '';
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts encrypted payload.
   */
  decryptApiKey(encryptedPayload: string): string {
    if (!encryptedPayload || !encryptedPayload.includes(':')) return '';
    try {
      const parts = encryptedPayload.split(':');
      if (parts.length !== 3) return '';

      const [ivHex, authTagHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err: any) {
      this.logger.error(`Failed to decrypt key: ${err.message}`);
      return '';
    }
  }

  /**
   * Hashes client gateway secret for lookups (never stores raw gateway secrets).
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generates a masked preview of an API key (e.g. sk-proj-...38aF)
   */
  maskApiKey(key: string): string {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    const prefix = key.slice(0, 7);
    const suffix = key.slice(-4);
    return `${prefix}••••••••${suffix}`;
  }

  /**
   * Generates a new cryptographically secure gateway secret key
   */
  generateGatewaySecret(prefix = 'spnd_live'): { secret: string; keyPrefix: string; hashedSecret: string } {
    const randomBytes = crypto.randomBytes(24).toString('hex');
    const secret = `${prefix}_${randomBytes}`;
    const keyPrefix = secret.slice(0, 14);
    const hashedSecret = this.hashToken(secret);
    return { secret, keyPrefix, hashedSecret };
  }
}
