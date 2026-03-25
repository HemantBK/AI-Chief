/**
 * Seed Safety Patterns
 * Loads known dangerous food advice patterns into the knowledge store.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { knowledgeStore } from '../src/ingestion/loader.js';
import { embedder } from '../src/ingestion/embedder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function seedSafetyPatterns() {
  console.log('Loading safety patterns...');

  const patternsPath = join(__dirname, '..', 'data', 'safety-patterns.json');
  const data = JSON.parse(readFileSync(patternsPath, 'utf-8'));

  let count = 0;
  for (const pattern of data.dangerous_patterns) {
    const embedding = await embedder.embed(pattern.text);
    await knowledgeStore.store(
      'safety-patterns',
      pattern.id,
      pattern.text,
      [pattern.category, pattern.severity],
      embedding
    );
    count++;
    console.log(`  [${count}/${data.dangerous_patterns.length}] ${pattern.id}`);
  }

  console.log(`\nSeeded ${count} safety patterns.`);
  return count;
}

seedSafetyPatterns().catch(console.error);

export { seedSafetyPatterns };
