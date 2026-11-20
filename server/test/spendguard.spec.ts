import { EncryptionService } from '../src/modules/encryption/encryption.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { AnomalyService } from '../src/modules/anomaly/anomaly.service';

describe('SpendGuard Core Backend Unit Tests', () => {
  let encryptionService: EncryptionService;
  let pricingService: PricingService;
  let anomalyService: AnomalyService;

  beforeAll(() => {
    const mockConfigService: any = {
      get: (key: string) => {
        if (key === 'encryptionMasterKey') return 'test-master-secret-key-32b-length!';
        if (key === 'jwt.accessSecret') return 'test-jwt-secret-pepper-32b-length!';
        return undefined;
      },
    };

    const mockPrisma: any = {
      modelPricing: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const mockRedis: any = {
      isConnected: false,
      getClient: () => null,
    };

    encryptionService = new EncryptionService(mockConfigService);
    pricingService = new PricingService(mockPrisma, mockRedis);
    anomalyService = new AnomalyService();
  });

  describe('1. AES-256-GCM Two-Tier Envelope Encryption', () => {
    it('should correctly encrypt and decrypt an OpenAI API key with envelope encryption', () => {
      const plaintext = 'sk-proj-live-production-secret-key-1234567890';
      const encrypted = encryptionService.encryptApiKey(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted.startsWith('env:v1:')).toBe(true);
      expect(encrypted).not.toEqual(plaintext);

      const decrypted = encryptionService.decryptApiKey(encrypted);
      expect(decrypted).toEqual(plaintext);
    });

    it('should generate masked preview of API key per PRD (sk-...cdef)', () => {
      const plain = 'sk-proj-9876543210abcdef';
      const masked = encryptionService.maskApiKey(plain);
      expect(masked).toBe('sk-...cdef');
    });

    it('should generate secure SpendGuard virtual key (sg_live_*) and peppered hash', () => {
      const { secret, keyPrefix, hashedSecret } = encryptionService.generateGatewaySecret();
      expect(secret.startsWith('sg_live_')).toBe(true);
      expect(keyPrefix.startsWith('sg_live_')).toBe(true);
      expect(hashedSecret).toBe(encryptionService.hashToken(secret));
    });

    it('should generate test SpendGuard virtual key (sg_test_*)', () => {
      const { secret, keyPrefix } = encryptionService.generateGatewaySecret('sg_test');
      expect(secret.startsWith('sg_test_')).toBe(true);
      expect(keyPrefix.startsWith('sg_test_')).toBe(true);
    });
  });

  describe('2. Multi-Provider Pricing Calculation', () => {
    it('should calculate accurate cost for GPT-4o (1200 in / 450 out)', () => {
      const cost = pricingService.calculateCost('gpt-4o', 1200, 450);
      // (1200 / 1M * 2.50) + (450 / 1M * 10.00) = 0.003000 + 0.004500 = 0.007500
      expect(cost).toBe(0.007500);
    });

    it('should calculate accurate cost for Claude Sonnet 5.5', () => {
      const cost = pricingService.calculateCost('claude-sonnet-5-5', 1200, 450);
      // (1200 / 1M * 2.00) + (450 / 1M * 10.00) = 0.002400 + 0.004500 = 0.006900
      expect(cost).toBe(0.0069);
    });

    it('should calculate accurate cost for Gemini 3.5 Flash-Lite', () => {
      const cost = pricingService.calculateCost('gemini-3.5-flash-lite', 1200, 450);
      // (1200 / 1M * 0.30) + (450 / 1M * 2.50) = 0.000360 + 0.001125 = 0.001485
      expect(cost).toBe(0.001485);
    });

    it('should resolve correct provider identifier', () => {
      expect(pricingService.resolveProvider('gpt-4o')).toBe('OPENAI');
      expect(pricingService.resolveProvider('claude-sonnet-5-5')).toBe('ANTHROPIC');
      expect(pricingService.resolveProvider('gemini-3.5-flash-lite')).toBe('GEMINI');
    });

    it('should return catalog prices through getAllPrices', () => {
      const prices = pricingService.getAllPrices();
      expect(prices.length).toBeGreaterThanOrEqual(10);
      const gpt4 = prices.find(p => p.model === 'gpt-4o');
      expect(gpt4).toBeDefined();
      expect(gpt4?.inputPricePerMillion).toBe(2.50);
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
