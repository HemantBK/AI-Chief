import PQueue from 'p-queue';
import { chunkDocument } from '../chunker.js';
import { CONFIG } from '../../config.js';
import type { DocumentChunk } from '../../types.js';

// ─── USDA FoodData Central API types ───────────────────────────────
interface USDAFoodNutrient {
  nutrientName: string;
  value: number;
  unitName: string;
}

interface USDAFood {
  fdcId: number;
  description: string;
  dataType?: string;
  foodCategory?: string;
  foodNutrients?: USDAFoodNutrient[];
}

interface USDASearchResponse {
  foods: USDAFood[];
  totalHits: number;
}

// ─── Rate-limited queue ────────────────────────────────────────────
// DEMO_KEY has strict rate limits (~30 requests/hour). Be very conservative.
const queue = new PQueue({ concurrency: 1, interval: 2000, intervalCap: 1 });

/**
 * Fetch foods from USDA FoodData Central and chunk them.
 */
export async function fetchUSDAFoods(
  apiKey: string,
  query: string,
  pageSize: number = 10,
): Promise<DocumentChunk[]> {
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('dataType', 'Survey (FNDDS),SR Legacy');

  const response = await queue.add(async () => {
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`USDA API error ${res.status}: ${res.statusText} for query "${query}"`);
    }
    return res.json() as Promise<USDASearchResponse>;
  });

  if (!response || !response.foods) return [];

  const chunks: DocumentChunk[] = [];

  for (const food of response.foods) {
    const text = formatFoodEntry(food);
    const foodChunks = chunkDocument(text, {
      source_url: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${food.fdcId}/nutrients`,
      source_type: 'usda',
      category: 'nutrition',
      title: food.description,
      author: 'USDA FoodData Central',
      date: new Date().toISOString().slice(0, 10),
    });
    chunks.push(...foodChunks);
  }

  return chunks;
}

/**
 * Format a USDA food entry into a readable text block.
 */
function formatFoodEntry(food: USDAFood): string {
  const lines: string[] = [];

  lines.push(`Food: ${food.description}`);

  if (food.foodCategory) {
    lines.push(`Category: ${food.foodCategory}`);
  }
  if (food.dataType) {
    lines.push(`Data Type: ${food.dataType}`);
  }

  lines.push('');

  if (food.foodNutrients && food.foodNutrients.length > 0) {
    lines.push('Nutritional Information (per 100g serving):');

    // Sort by nutrient name and take top 20
    const nutrients = food.foodNutrients
      .filter((n) => n.value > 0)
      .sort((a, b) => {
        // Prioritize macronutrients
        const priority = [
          'Energy', 'Protein', 'Total lipid', 'Carbohydrate',
          'Fiber', 'Sugars', 'Sodium', 'Calcium', 'Iron',
          'Potassium', 'Vitamin C', 'Vitamin A', 'Vitamin D',
          'Vitamin B-6', 'Vitamin B-12', 'Folate', 'Magnesium',
          'Zinc', 'Cholesterol', 'Fatty acids',
        ];
        const aIdx = priority.findIndex((p) => a.nutrientName.startsWith(p));
        const bIdx = priority.findIndex((p) => b.nutrientName.startsWith(p));
        const aPri = aIdx === -1 ? 999 : aIdx;
        const bPri = bIdx === -1 ? 999 : bIdx;
        return aPri - bPri;
      })
      .slice(0, 20);

    for (const n of nutrients) {
      lines.push(`  ${n.nutrientName}: ${n.value} ${n.unitName}`);
    }
  }

  return lines.join('\n');
}

/**
 * Returns a list of ~50 common cooking ingredients to query from USDA.
 */
export function getTopIngredients(): string[] {
  // Reduced list for DEMO_KEY rate limits. With a real API key, expand to 50+
  return [
    'chicken', 'beef', 'salmon', 'egg', 'milk',
    'butter', 'cheese', 'olive oil', 'flour', 'sugar',
    'rice', 'potato', 'onion', 'garlic', 'tomato',
  ];
}
