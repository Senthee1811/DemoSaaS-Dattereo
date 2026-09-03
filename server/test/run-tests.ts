import { EncryptionService } from '../src/modules/encryption/encryption.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { AnomalyService } from '../src/modules/anomaly/anomaly.service';

console.log('=== SpendGuard Production NestJS Backend Verification Suite ===\n');

async function run() {
  const mockConfigService: any = {
    get: (key: string) => (key === 'encryptionMasterKey' ? 'test-master-secret-key-32b-length!' : undefined),
  };

  const encryptionService = new EncryptionService(mockConfigService);
  const pricingService = new PricingService();
  const anomalyService = new AnomalyService();

  // 1. Encryption
  console.log('▶ 1. AES-256-GCM Envelope Encryption & Masking');
  const plain = 'sk-proj-live-production-secret-key-1234567890';
  const encrypted = encryptionService.encryptApiKey(plain);
  console.log('  ✓ Encrypted cipher length:', encrypted.length);
  const decrypted = encryptionService.decryptApiKey(encrypted);
  if (decrypted !== plain) throw new Error('Decryption mismatch');
  console.log('  ✓ Decrypted matches plain:', decrypted === plain);

  const masked = encryptionService.maskApiKey(plain);
  console.log('  ✓ Masked preview:', masked);

  const { secret, keyPrefix, hashedSecret } = encryptionService.generateGatewaySecret();
  console.log('  ✓ Generated gateway secret:', keyPrefix + '••••••••');
  console.log('  ✓ Hash verified:', hashedSecret === encryptionService.hashToken(secret));

  // 2. Pricing
  console.log('\n▶ 2. Multi-Provider Pricing Catalog Accuracy');
  const gpt4oCost = pricingService.calculateCost('gpt-4o', 1200, 450);
  const claudeCost = pricingService.calculateCost('claude-3-5-sonnet-20241022', 1200, 450);
  const geminiCost = pricingService.calculateCost('gemini-1.5-pro', 1200, 450);

  console.log(`  ✓ GPT-4o (1200 in / 450 out): $${gpt4oCost.toFixed(6)}`);
  console.log(`  ✓ Claude 3.5 Sonnet (1200 in / 450 out): $${claudeCost.toFixed(6)}`);
  console.log(`  ✓ Gemini 1.5 Pro (1200 in / 450 out): $${geminiCost.toFixed(6)}`);

  if (gpt4oCost !== 0.0075) throw new Error('GPT-4o calculation mismatch');
  if (claudeCost !== 0.01035) throw new Error('Claude calculation mismatch');
  if (geminiCost !== 0.00375) throw new Error('Gemini calculation mismatch');

  // 3. Anomaly
  console.log('\n▶ 3. Statistical Usage Spike Anomaly Detection');
  const baseline = [
    { costEstimate: 0.005, totalTokens: 400 },
    { costEstimate: 0.006, totalTokens: 480 },
    { costEstimate: 0.004, totalTokens: 380 },
    { costEstimate: 0.005, totalTokens: 420 },
    { costEstimate: 0.007, totalTokens: 550 },
  ];

  const normalCheck = anomalyService.detectSpike(0.006, 500, baseline);
  console.log('  ✓ Normal request anomaly:', normalCheck.isAnomaly);
  if (normalCheck.isAnomaly) throw new Error('Normal request falsely flagged as anomaly');

  const spikeCheck = anomalyService.detectSpike(0.48, 28000, baseline);
  console.log('  ✓ Spike request anomaly:', spikeCheck.isAnomaly, `(Score: ${spikeCheck.score})`);
  console.log('  ✓ Spike reason:', spikeCheck.reason);
  if (!spikeCheck.isAnomaly) throw new Error('Spike request was not flagged');

  console.log('\n=== ALL NESTJS BACKEND CORE VERIFICATIONS PASSED ===');
}

run().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
