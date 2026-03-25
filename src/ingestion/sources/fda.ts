import * as cheerio from 'cheerio';
import { chunkDocument } from '../chunker.js';
import type { DocumentChunk } from '../../types.js';

/**
 * Curated list of FDA food safety pages covering critical topics.
 */
const FDA_SAFETY_URLS: { url: string; title: string }[] = [
  {
    url: 'https://www.fda.gov/food/people-risk-foodborne-illness/safe-food-handling',
    title: 'Safe Food Handling',
  },
  {
    url: 'https://www.fda.gov/food/buy-store-serve-safe-food/safe-food-temperatures',
    title: 'Safe Food Temperatures',
  },
  {
    url: 'https://www.fda.gov/food/buy-store-serve-safe-food/refrigerator-thermometers-cold-facts-about-food-safety',
    title: 'Refrigerator Thermometers and Food Safety',
  },
  {
    url: 'https://www.fda.gov/food/food-allergensgluten-free-guidance-documents-regulatory-information/food-allergen-labeling-and-consumer-protection-act-2004-falcpa',
    title: 'Food Allergen Labeling (FALCPA)',
  },
  {
    url: 'https://www.fda.gov/food/people-risk-foodborne-illness/meat-poultry-seafood-food-safety-moms-be',
    title: 'Meat, Poultry, Seafood Safety',
  },
  {
    url: 'https://www.fda.gov/food/buy-store-serve-safe-food/are-you-storing-food-safely',
    title: 'Food Storage Safety',
  },
  {
    url: 'https://www.fda.gov/food/people-risk-foodborne-illness/food-safety-moms-be',
    title: 'Food Safety for Pregnant Women',
  },
  {
    url: 'https://www.fda.gov/food/resourcesforyou/consumers/ucm103263.htm',
    title: 'Foodborne Illness Contaminants',
  },
  {
    url: 'https://www.fda.gov/food/food-safety-during-emergencies/food-safety-and-hurricanes-power-outages-and-flooding',
    title: 'Food Safety During Power Outages',
  },
  {
    url: 'https://www.fda.gov/food/buy-store-serve-safe-food/handling-flour-safely-what-you-need-know',
    title: 'Handling Flour Safely',
  },
  {
    url: 'https://www.fda.gov/food/buy-store-serve-safe-food/what-you-need-know-about-egg-safety',
    title: 'Egg Safety',
  },
  {
    url: 'https://www.fda.gov/food/consumers/what-you-need-know-about-foodborne-illnesses',
    title: 'What You Need to Know About Foodborne Illnesses',
  },
  {
    url: 'https://www.fda.gov/food/people-risk-foodborne-illness/cutting-boards-and-food-safety',
    title: 'Cutting Boards and Food Safety',
  },
  {
    url: 'https://www.fda.gov/food/metals-and-your-food/arsenic-food-and-dietary-supplements',
    title: 'Arsenic in Food and Dietary Supplements',
  },
  {
    url: 'https://www.fda.gov/food/chemical-contaminants-food/acrylamide',
    title: 'Acrylamide in Food',
  },
];

/**
 * Extract readable text content from an HTML page using cheerio.
 * Strips navigation, scripts, styles, headers, footers and extracts main content.
 */
function extractTextContent(html: string): string {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $('script, style, nav, header, footer, .breadcrumb, .sidebar, .navigation, [role="navigation"]').remove();

  // Try to find main content area
  let contentEl = $('main, article, [role="main"], .content-main, .page-content, #content');
  if (contentEl.length === 0) {
    contentEl = $('body');
  }

  // Extract text, preserving paragraph structure
  const blocks: string[] = [];
  contentEl.find('h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 10) {
      const tagName = $(el).prop('tagName')?.toLowerCase() || '';
      if (tagName.startsWith('h')) {
        blocks.push(`\n${text}\n`);
      } else {
        blocks.push(text);
      }
    }
  });

  return blocks.join('\n\n');
}

/**
 * Fetch and chunk FDA food safety pages.
 *
 * Each page is fetched, its text extracted via cheerio,
 * then chunked with source_type='fda' and category='safety'.
 * Failed URLs are logged and skipped gracefully.
 */
export async function fetchFDASafetyPages(): Promise<DocumentChunk[]> {
  const allChunks: DocumentChunk[] = [];

  for (const page of FDA_SAFETY_URLS) {
    try {
      const response = await fetch(page.url, {
        headers: {
          'User-Agent': 'AI-Chef-Research-Bot/1.0 (educational food science project)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        console.warn(`[FDA] Skipping ${page.title}: HTTP ${response.status}`);
        continue;
      }

      const html = await response.text();
      const text = extractTextContent(html);

      if (text.length < 100) {
        console.warn(`[FDA] Skipping ${page.title}: insufficient content extracted (${text.length} chars)`);
        continue;
      }

      const chunks = chunkDocument(text, {
        source_url: page.url,
        source_type: 'fda',
        category: 'safety',
        title: page.title,
        author: 'U.S. Food and Drug Administration',
        date: new Date().toISOString().slice(0, 10),
      });

      allChunks.push(...chunks);
      console.log(`[FDA] Chunked "${page.title}": ${chunks.length} chunks`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[FDA] Failed to fetch "${page.title}": ${message}`);
    }
  }

  console.log(`[FDA] Total chunks: ${allChunks.length} from ${FDA_SAFETY_URLS.length} pages`);
  return allChunks;
}
