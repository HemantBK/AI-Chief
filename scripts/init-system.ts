/**
 * Full System Initialization
 * Runs all ingestion sources and seeds safety patterns.
 */

import { runFullIngestion } from '../src/ingestion/index.js';
import { seedSafetyPatterns } from './seed-safety-patterns.js';
import { knowledgeStore } from '../src/ingestion/loader.js';

async function initializeSystem() {
  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║       🧑‍🍳  AI Chef - System Initialization  🔬      ║
  ╚══════════════════════════════════════════════════════╝
  `);

  const startTime = Date.now();

  // Step 1: Run full ingestion pipeline
  console.log('\n📚 Step 1: Ingesting knowledge sources...\n');
  const ingestionResult = await runFullIngestion();
  console.log('\nIngestion stats:', ingestionResult.stats);

  // Step 2: Seed safety patterns
  console.log('\n🛡️  Step 2: Seeding safety patterns...\n');
  const patternCount = await seedSafetyPatterns();

  // Step 3: Print summary
  const stats = knowledgeStore.getStats();
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║              ✅ Initialization Complete               ║
  ╠══════════════════════════════════════════════════════╣
  ║                                                      ║`);

  for (const [ns, count] of Object.entries(stats.namespaces)) {
    const padded = ns.padEnd(25);
    const countStr = String(count).padStart(5);
    console.log(`  ║  ${padded} ${countStr} chunks              ║`);
  }

  console.log(`  ║                                                      ║
  ║  Total chunks: ${String(Object.values(stats.namespaces).reduce((a, b) => a + b, 0)).padStart(5)}                              ║
  ║  Safety patterns: ${String(patternCount).padStart(5)}                           ║
  ║  Time: ${totalTime.padStart(6)}s                                ║
  ╚══════════════════════════════════════════════════════╝
  `);
}

initializeSystem().catch(err => {
  console.error('Initialization failed:', err);
  process.exit(1);
});
