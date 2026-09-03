import { EncryptionService } from '../src/modules/encryption/encryption.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { AnomalyService } from '../src/modules/anomaly/anomaly.service';

describe('SpendGuard Core Backend Unit Tests', () => {
  let encryptionService: EncryptionService;
  let pricingService: PricingService;
  let anomalyService: AnomalyService;

  beforeAll(() => {
    const mockConfigService: any = {
      get: (key: string) => (key === 'encryptionMasterKey' ? 'test-master-secret-key-32b-length!' : undefined),
    };

    encryptionService = new EncryptionService(mockConfigService);
    pricingService = new PricingService();
    anomalyService = new AnomalyService();
  });

  describe('1. AES-256-GCM Envelope Encryption', () => {
    it('should correctly encrypt and decrypt an OpenAI API key', () => {
      const plaintext = 'sk-proj-live-production-secret-key-1234567890';
      const encrypted = encryptionService.encryptApiKey(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted).toContain(':');
      expect(encrypted).not.toEqual(plaintext);

      const decrypted = encryptionService.decryptApiKey(encrypted);
      expect(decrypted).toEqual(plaintext);
    });

    it('should generate masked preview of API key', () => {
      const plain = 'sk-proj-9876543210abcdef';
      const masked = encryptionService.maskApiKey(plain);
      expect(masked).toBe('sk-proj••••••••cdef');
    });

    it('should generate secure gateway token and deterministic hash', () => {
      const { secret, keyPrefix, hashedSecret } = encryptionService.generateGatewaySecret();
      expect(secret.startsWith('spnd_live_')).toBe(true);
      expect(keyPrefix.length).toBe(14);
      expect(hashedSecret).toBe(encryptionService.hashToken(secret));
    });
  });

  describe('2. Multi-Provider Pricing Calculation', () => {
    it('should calculate accurate cost for GPT-4o (1200 in / 450 out)', () => {
      const cost = pricingService.calculateCost('gpt-4o', 1200, 450);
      // (1200 / 1M * 2.50) + (450 / 1M * 10.00) = 0.003000 + 0.004500 = 0.007500
      expect(cost).toBe(0.007500);
    });

    it('should calculate accurate cost for Claude 3.5 Sonnet', () => {
      const cost = pricingService.calculateCost('claude-3-5-sonnet-20241022', 1200, 450);
      // (1200 / 1M * 3.00) + (450 / 1M * 15.00) = 0.003600 + 0.006750 = 0.010350
      expect(cost).toBe(0.010350);
    });

    it('should calculate accurate cost for Gemini 1.5 Pro', () => {
      const cost = pricingService.calculateCost('gemini-1.5-pro', 1200, 450);
      // (1200 / 1M * 1.25) + (450 / 1M * 5.00) = 0.001500 + 0.002250 = 0.003750
      expect(cost).toBe(0.003750);
    });

    it('should resolve correct provider identifier', () => {
      expect(pricingService.resolveProvider('gpt-4o')).toBe('OPENAI');
      expect(pricingService.resolveProvider('claude-3-5-sonnet')).toBe('ANTHROPIC');
      expect(pricingService.resolveProvider('gemini-1.5-pro')).toBe('GEMINI');
    });
  });

  describe('3. Statistical Usage Spike Anomaly Detection', () => {
    it('should not flag normal baseline usage', () => {
      const history = [
        { costEstimate: 0.005, totalTokens: 400 },
        { costEstimate: 0.006, totalTokens: 480 },
        { costEstimate: 0.004, totalTokens: 380 },
        { costEstimate: 0.005, totalTokens: 420 },
        { costEstimate: 0.007, totalTokens: 550 },
      ];

      const res = anomalyService.detectSpike(0.006, 500, history);
      expect(res.isAnomaly).toBe(false);
    });

    it('should flag severe cost spike (80x baseline)', () => {
      const history = [
        { costEstimate: 0.005, totalTokens: 400 },
        { costEstimate: 0.006, totalTokens: 480 },
        { costEstimate: 0.004, totalTokens: 380 },
        { costEstimate: 0.005, totalTokens: 420 },
        { costEstimate: 0.007, totalTokens: 550 },
      ];

      const res = anomalyService.detectSpike(0.48, 28000, history);
      expect(res.isAnomaly).toBe(true);
      expect(res.reason).toContain('Abnormal Cost Spike');
    });
  });
});
