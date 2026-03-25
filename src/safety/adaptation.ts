/**
 * SONA Safety Adaptation
 * Learns from safety review outcomes to adaptively adjust scrutiny.
 * Uses an exponential moving average to track safety quality trends.
 */

class SafetyAdaptation {
  private qualityHistory: number[] = [];
  private adaptiveThreshold: number = 0.6;  // Default safety threshold
  private readonly emaAlpha = 0.1;           // EMA smoothing factor
  private emaValue = 0.8;                    // Start optimistic
  private sonaId: string | null = null;

  /**
   * Record a safety score from a query and adapt thresholds
   */
  async adapt(safetyScore: number): Promise<{
    adaptiveThreshold: number;
    trend: 'improving' | 'degrading' | 'stable';
    emaQuality: number;
  }> {
    this.qualityHistory.push(safetyScore);

    // Update EMA
    const previousEma = this.emaValue;
    this.emaValue = this.emaAlpha * safetyScore + (1 - this.emaAlpha) * this.emaValue;

    // Determine trend
    const trend = this.emaValue > previousEma + 0.01
      ? 'improving'
      : this.emaValue < previousEma - 0.01
        ? 'degrading'
        : 'stable';

    // Adapt threshold based on trend
    if (trend === 'degrading') {
      // Become more conservative
      this.adaptiveThreshold = Math.min(0.8, this.adaptiveThreshold + 0.02);
    } else if (trend === 'improving' && this.qualityHistory.length > 10) {
      // Relax slightly if consistently good
      this.adaptiveThreshold = Math.max(0.5, this.adaptiveThreshold - 0.01);
    }

    return {
      adaptiveThreshold: this.adaptiveThreshold,
      trend,
      emaQuality: Math.round(this.emaValue * 1000) / 1000,
    };
  }

  /**
   * Get current adaptive threshold for safety gating
   */
  getThreshold(): number {
    return this.adaptiveThreshold;
  }

  /**
   * Get adaptation stats
   */
  getStats(): {
    queriesProcessed: number;
    currentThreshold: number;
    emaQuality: number;
    recentAvg: number;
  } {
    const recent = this.qualityHistory.slice(-20);
    const recentAvg = recent.length > 0
      ? recent.reduce((a, b) => a + b, 0) / recent.length
      : 0;

    return {
      queriesProcessed: this.qualityHistory.length,
      currentThreshold: this.adaptiveThreshold,
      emaQuality: Math.round(this.emaValue * 1000) / 1000,
      recentAvg: Math.round(recentAvg * 1000) / 1000,
    };
  }

  /**
   * Reset adaptation state (for testing)
   */
  reset(): void {
    this.qualityHistory = [];
    this.adaptiveThreshold = 0.6;
    this.emaValue = 0.8;
  }
}

export const safetyAdaptation = new SafetyAdaptation();
