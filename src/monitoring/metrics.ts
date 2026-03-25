/**
 * Metrics Collection
 * Stores per-query metrics for the monitoring dashboard.
 */

import { QueryMetric, DashboardData } from '../types.js';

class MetricsCollector {
  private metrics: QueryMetric[] = [];
  private ingredientConflicts: Map<string, number> = new Map();

  /**
   * Record metrics for a processed query
   */
  async record(metric: QueryMetric): Promise<void> {
    this.metrics.push(metric);

    // Track ingredient conflicts
    if (metric.conflict_detected) {
      const words = metric.query.toLowerCase().split(/\W+/);
      const ingredients = words.filter(w => w.length > 3);
      for (const ingredient of ingredients) {
        this.ingredientConflicts.set(
          ingredient,
          (this.ingredientConflicts.get(ingredient) || 0) + 1
        );
      }
    }

    console.log(`[Metrics] Recorded query #${this.metrics.length}: safety=${metric.safety_score}`);
  }

  /**
   * Get aggregated dashboard data
   */
  getDashboard(): DashboardData {
    const total = this.metrics.length;
    if (total === 0) {
      return {
        avg_safety_score: 1.0,
        total_queries: 0,
        category_distribution: {},
        recent_flags: [],
        top_conflicting_ingredients: [],
        response_time_p50: 0,
        response_time_p95: 0,
      };
    }

    // Average safety score
    const avg_safety_score = this.metrics.reduce((sum, m) => sum + m.safety_score, 0) / total;

    // Category distribution
    const category_distribution: Record<string, number> = {};
    for (const m of this.metrics) {
      for (const cat of m.categories_routed) {
        category_distribution[cat] = (category_distribution[cat] || 0) + 1;
      }
    }

    // Recent flagged queries
    const recent_flags = this.metrics
      .filter(m => m.safety_flags.length > 0)
      .slice(-20)
      .reverse();

    // Top conflicting ingredients
    const top_conflicting_ingredients = [...this.ingredientConflicts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ingredient, count]) => ({ ingredient, count }));

    // Response time percentiles
    const sortedTimes = this.metrics.map(m => m.response_time_ms).sort((a, b) => a - b);
    const response_time_p50 = percentile(sortedTimes, 0.5);
    const response_time_p95 = percentile(sortedTimes, 0.95);

    return {
      avg_safety_score: Math.round(avg_safety_score * 1000) / 1000,
      total_queries: total,
      category_distribution,
      recent_flags,
      top_conflicting_ingredients,
      response_time_p50: Math.round(response_time_p50),
      response_time_p95: Math.round(response_time_p95),
    };
  }

  /**
   * Get safety score history (for trend chart)
   */
  getSafetyTrend(limit: number = 50): { timestamp: string; score: number }[] {
    return this.metrics.slice(-limit).map(m => ({
      timestamp: m.timestamp,
      score: m.safety_score,
    }));
  }

  /**
   * Get all raw metrics
   */
  getAll(): QueryMetric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics count
   */
  getCount(): number {
    return this.metrics.length;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.min(Math.max(0, idx), sorted.length - 1)];
}

export const metricsCollector = new MetricsCollector();
