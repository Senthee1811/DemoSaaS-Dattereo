export interface AnomalyResult {
  isAnomaly: boolean;
  reason?: string;
  zScore?: number;
  multiplier?: number;
}

/**
 * Statistical spike anomaly detector based on rolling history
 */
export function detectAnomaly(
  currentCost: number,
  currentTokens: number,
  historicalRequests: { costEstimate: number; totalTokens: number }[]
): AnomalyResult {
  // If fewer than 5 historical records, cannot establish stable statistical baseline
  if (historicalRequests.length < 5) {
    if (currentCost > 0.50 || currentTokens > 15000) {
      return {
        isAnomaly: true,
        reason: `Initial high volume spike: $${currentCost.toFixed(4)} with ${currentTokens.toLocaleString()} tokens`,
        multiplier: 3.5
      };
    }
    return { isAnomaly: false };
  }

  // Calculate costs mean and standard deviation
  const costs = historicalRequests.map(r => r.costEstimate);
  const meanCost = costs.reduce((sum, c) => sum + c, 0) / costs.length;
  
  const varianceCost = costs.reduce((sum, c) => sum + Math.pow(c - meanCost, 2), 0) / costs.length;
  const stdDevCost = Math.sqrt(varianceCost);

  // Calculate token mean and std dev
  const tokens = historicalRequests.map(r => r.totalTokens);
  const meanTokens = tokens.reduce((sum, t) => sum + t, 0) / tokens.length;
  const varianceTokens = tokens.reduce((sum, t) => sum + Math.pow(t - meanTokens, 2), 0) / tokens.length;
  const stdDevTokens = Math.sqrt(varianceTokens);

  // Check Z-Scores
  const zScoreCost = stdDevCost > 0 ? (currentCost - meanCost) / stdDevCost : 0;
  const zScoreTokens = stdDevTokens > 0 ? (currentTokens - meanTokens) / stdDevTokens : 0;

  // Multiplier over mean
  const costMultiplier = meanCost > 0 ? currentCost / meanCost : 1;
  const tokenMultiplier = meanTokens > 0 ? currentTokens / meanTokens : 1;

  // Criteria 1: Cost Z-Score > 3.0 or multiplier >= 4.0 with significant absolute value (> $0.05)
  if ((zScoreCost >= 2.8 || costMultiplier >= 4.0) && currentCost > 0.03) {
    return {
      isAnomaly: true,
      reason: `Abnormal Cost Spike: $${currentCost.toFixed(4)} is ${costMultiplier.toFixed(1)}x project average ($${meanCost.toFixed(4)}) [Z-Score: ${zScoreCost.toFixed(2)}]`,
      zScore: Math.round(zScoreCost * 100) / 100,
      multiplier: Math.round(costMultiplier * 10) / 10
    };
  }

  // Criteria 2: Token volume Z-Score > 3.0 or multiplier >= 4.0
  if ((zScoreTokens >= 2.8 || tokenMultiplier >= 4.0) && currentTokens > 5000) {
    return {
      isAnomaly: true,
      reason: `Abnormal Token Surge: ${currentTokens.toLocaleString()} tokens is ${tokenMultiplier.toFixed(1)}x project average (${Math.round(meanTokens).toLocaleString()})`,
      zScore: Math.round(zScoreTokens * 100) / 100,
      multiplier: Math.round(tokenMultiplier * 10) / 10
    };
  }

  return { isAnomaly: false };
}
