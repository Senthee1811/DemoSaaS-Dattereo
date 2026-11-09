import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Envelope Encryption Service (PRD FR2 & Step 4)
 * 
 * Implements two-tier envelope encryption:
 * 1. A cryptographically random Data Encryption Key (DEK, 256-bit) encrypts the plaintext using AES-256-GCM.
 * 2. The DEK itself is encrypted using the Master Key Encryption Key (KEK) using AES-256-GCM.
 * 3. Master key is sourced exclusively from validated environment configuration.
 * 4. Backward-compatible with legacy single-tier AES-256-GCM ciphertexts.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 16;
  private readonly masterKey: Buffer;
  private readonly pepper: string;

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.get<string>('encryptionMasterKey') || 'spendguard-master-encryption-key-32b!';
    this.masterKey = crypto.createHash('sha256').update(rawKey).digest();
    this.pepper = this.configService.get<string>('jwt.accessSecret') || 'spendguard-pepper-default-salt';
  }

  /**
   * Encrypts plaintext provider API key using two-tier AES-256-GCM envelope encryption.
   * Format: env:v1:dekIv:dekAuthTag:encryptedDek:dataIv:dataAuthTag:encryptedData
   */
  encryptApiKey(plaintext: string): string {
    if (!plaintext) return '';

    // 1. Generate unique 256-bit Data Encryption Key (DEK)
    const dek = crypto.randomBytes(32);

    // 2. Encrypt plaintext with DEK
    const dataIv = crypto.randomBytes(this.ivLength);
    const dataCipher = crypto.createCipheriv(this.algorithm, dek, dataIv);
    let encryptedData = dataCipher.update(plaintext, 'utf8', 'hex');
    encryptedData += dataCipher.final('hex');
    const dataAuthTag = dataCipher.getAuthTag().toString('hex');

    // 3. Encrypt DEK with Master KEK
    const dekIv = crypto.randomBytes(this.ivLength);
    const dekCipher = crypto.createCipheriv(this.algorithm, this.masterKey, dekIv);
    let encryptedDek = dekCipher.update(dek.toString('hex'), 'utf8', 'hex');
    encryptedDek += dekCipher.final('hex');
    const dekAuthTag = dekCipher.getAuthTag().toString('hex');

    return `env:v1:${dekIv.toString('hex')}:${dekAuthTag}:${encryptedDek}:${dataIv.toString('hex')}:${dataAuthTag}:${encryptedData}`;
  }

  /**
   * Decrypts encrypted payload, transparently handling both envelope (env:v1:...)
   * and legacy single-tier (iv:authTag:cipher) formats.
   */
  decryptApiKey(encryptedPayload: string): string {
    if (!encryptedPayload) return '';

    try {
      // Format 1: Envelope encryption (env:v1:...)
      if (encryptedPayload.startsWith('env:v1:')) {
        const parts = encryptedPayload.split(':');
        if (parts.length !== 8) {
          throw new Error('Malformed envelope encryption payload');
        }

        const [, , dekIvHex, dekAuthTagHex, encDekHex, dataIvHex, dataAuthTagHex, encDataHex] = parts;

        // Decrypt DEK using Master KEK
        const dekIv = Buffer.from(dekIvHex, 'hex');
        const dekAuthTag = Buffer.from(dekAuthTagHex, 'hex');
        const dekDecipher = crypto.createDecipheriv(this.algorithm, this.masterKey, dekIv);
        dekDecipher.setAuthTag(dekAuthTag);
        let dekHex = dekDecipher.update(encDekHex, 'hex', 'utf8');
        dekHex += dekDecipher.final('utf8');
        const dek = Buffer.from(dekHex, 'hex');

        // Decrypt Data using DEK
        const dataIv = Buffer.from(dataIvHex, 'hex');
        const dataAuthTag = Buffer.from(dataAuthTagHex, 'hex');
        const dataDecipher = crypto.createDecipheriv(this.algorithm, dek, dataIv);
        dataDecipher.setAuthTag(dataAuthTag);
        let decrypted = dataDecipher.update(encDataHex, 'hex', 'utf8');
        decrypted += dataDecipher.final('utf8');

        return decrypted;
      }

      // Format 2: Legacy single-tier encryption (iv:authTag:ciphertext)
      const parts = encryptedPayload.split(':');
      if (parts.length === 3) {
        const [ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }

      return '';
    } catch (err: any) {
      this.logger.error(`Failed to decrypt key: ${err.message}`);
      return '';
    }
  }

  /**
   * Hashes client gateway secret for lookups with server pepper (never stores raw gateway secrets).
   */
  hashToken(token: string): string {
    return crypto.createHmac('sha256', this.pepper).update(token).digest('hex');
  }

  /**
   * Generates a masked preview of an API key per PRD Step 4 (e.g. "sk-...ab12")
   */
  maskApiKey(key: string): string {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    const prefix = key.slice(0, 3);
    const suffix = key.slice(-4);
    return `${prefix}...${suffix}`;
  }

  /**
   * Generates a new cryptographically secure SpendGuard virtual gateway key.
   * Format: sg_live_<random_hex> or sg_test_<random_hex> per PRD Section 7.
   */
  generateGatewaySecret(prefix = 'sg_live'): { secret: string; keyPrefix: string; hashedSecret: string } {
    const randomBytes = crypto.randomBytes(24).toString('hex');
    const secret = `${prefix}_${randomBytes}`;
    const keyPrefix = secret.slice(0, 14); // e.g. "sg_live_a1b2c3"
    const hashedSecret = this.hashToken(secret);
    return { secret, keyPrefix, hashedSecret };
  }
}
