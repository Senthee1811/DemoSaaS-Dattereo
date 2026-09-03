import { Injectable, Logger } from '@nestjs/common';

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  reason?: string;
}

export interface HistoricalUsagePoint {
  costEstimate: number;
  totalTokens: number;
}

@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);

  /**
   * Statistical Z-score & outlier spike detector
   */
  detectSpike(
    currentCost: number,
    currentTokens: number,
    history: HistoricalUsagePoint[],
    zScoreThreshold = 3.0
  ): AnomalyResult {
    // If not enough history, fallback to heuristic absolute threshold
    if (!history || history.length < 5) {
      if (currentCost > 0.40 || currentTokens > 25000) {
        return {
          isAnomaly: true,
          score: 3.5,
          reason: `High absolute spend spike: $${currentCost.toFixed(4)} (${currentTokens.toLocaleString()} tokens)`
        };
      }
      return { isAnomaly: false, score: 0 };
    }

    const costs = history.map(h => h.costEstimate);
    const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
    const variance = costs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / costs.length;
    const stdDev = Math.sqrt(variance);

    // Multiplier check against mean
    const multiplier = mean > 0 ? currentCost / mean : 1;

    // If standard deviation is minimal or 0
    if (stdDev < 0.0001) {
      if (multiplier > 5.0 && currentCost > 0.05) {
        return {
          isAnomaly: true,
          score: 4.0,
          reason: `Abnormal Cost Spike: $${currentCost.toFixed(4)} is ${multiplier.toFixed(1)}x project average ($${mean.toFixed(4)})`
        };
      }
      return { isAnomaly: false, score: 0 };
    }

    const zScore = (currentCost - mean) / stdDev;

    if (zScore >= zScoreThreshold && multiplier >= 3.0) {
      return {
        isAnomaly: true,
        score: Number(zScore.toFixed(2)),
        reason: `Abnormal Cost Spike: $${currentCost.toFixed(4)} is ${multiplier.toFixed(1)}x project average ($${mean.toFixed(4)}) [Z-Score: ${zScore.toFixed(2)}]`
      };
    }

    return { isAnomaly: false, score: Number(zScore.toFixed(2)) };
  }
}
