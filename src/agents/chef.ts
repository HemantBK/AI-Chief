/**
 * Chef Agent — Claude-Powered Answer Synthesis
 * Uses the `claude` CLI (Max plan) to generate intelligent food science answers.
 * Falls back to template-based synthesis if CLI is unavailable.
 */

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { ragEngine } from '../rag/index.js';
import { citationManager } from '../rag/citation.js';
import { ChefResponse, RetrievedChunk, Citation } from '../types.js';

const execFileAsync = promisify(execFile);

// Resolve claude CLI path — child_process may not inherit shell PATH
const CLAUDE_PATHS = [
  'claude',
  'C:\\Users\\91734\\AppData\\Local\\nvm\\v22.12.0\\claude.cmd',
  'C:\\Users\\91734\\AppData\\Local\\nvm\\v22.12.0\\claude',
];

class ChefAgent {
  private claudeAvailable: boolean | null = null;
  private claudePath: string = 'claude';

  /**
   * Check if `claude` CLI is available
   */
  private async checkClaude(): Promise<boolean> {
    if (this.claudeAvailable !== null) return this.claudeAvailable;
    for (const p of CLAUDE_PATHS) {
      try {
        await execFileAsync(p, ['--version'], { timeout: 10000, shell: true });
        this.claudePath = p;
        this.claudeAvailable = true;
        console.log(`[Chef] Claude CLI found at ${p} — using Max plan for AI answers`);
        return true;
      } catch {
        continue;
      }
    }
    this.claudeAvailable = false;
    console.log('[Chef] Claude CLI not found — using template-based answers');
    return false;
  }

  /**
   * Call Claude CLI with a prompt via stdin + --print (non-interactive)
   */
  private callClaude(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      const proc = spawn(this.claudePath, ['--print'], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 90000,
        env: { ...process.env, HOME: process.env.USERPROFILE || process.env.HOME },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('close', (code: number) => {
        const result = stdout.trim();
        // Detect auth failures and treat as empty (trigger fallback)
        if (result.includes('Not logged in') || result.includes('Please run /login') || result.includes('Authentication')) {
          console.warn('[Chef] Claude CLI auth failed — falling back to template engine');
          this.claudeAvailable = false; // Don't retry
          resolve('');
        } else if (code !== 0 && !result) {
          console.error('[Chef] Claude CLI error (exit', code + '):', stderr.slice(0, 200));
          resolve('');
        } else {
          resolve(result);
        }
      });

      proc.on('error', (err: Error) => {
        console.error('[Chef] Claude CLI spawn error:', err.message);
        resolve('');
      });

      // Write prompt to stdin and close
      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }

  async answer(question: string): Promise<ChefResponse> {
    console.log(`[Chef] Processing: "${question}"`);

    const { context, contextString, citations } = await ragEngine.process(question);

    // If no relevant chunks found, handle gracefully
    if (context.retrieved_chunks.length === 0) {
      const answer = this.handleNoResults(question);
      return { answer, citations: [], raw_chunks: [] };
    }

    // Try Claude-powered answer first
    const useClaude = await this.checkClaude();
    let answer: string;

    if (useClaude) {
      answer = await this.generateClaudeAnswer(question, context.retrieved_chunks, citations);
    } else {
      answer = this.synthesizeAnswer(question, context.retrieved_chunks, citations, context.conflict_detected);
    }

    return { answer, citations, raw_chunks: context.retrieved_chunks };
  }

  /**
   * Generate answer using Claude CLI (Max plan, $0 cost)
   */
  private async generateClaudeAnswer(
    question: string,
    chunks: RetrievedChunk[],
    citations: Citation[]
  ): Promise<string> {
    // Build context from retrieved chunks
    const contextParts = chunks.map((c, i) => {
      const meta = c.chunk.metadata;
      const text = c.chunk.text.slice(0, 800); // Limit each chunk
      return `[Source ${i + 1}: "${meta.title}" (${meta.source_type.toUpperCase()}) - ${meta.source_url}]\n${text}`;
    });

    const prompt = `You are Chef Scientia, an AI culinary scientist. You explain food science with warmth, precision, and enthusiasm.

RULES:
- Answer based ONLY on the provided context documents below.
- Cite sources using [1], [2] etc. matching the source numbers.
- If the context doesn't fully cover the question, say what you know from the context and note what's missing.
- For food safety questions, always err on the side of caution.
- Never recommend temperatures below USDA safe minimums.
- Explain WHY things happen (the mechanism), not just what happens.
- Keep your answer concise but thorough (3-6 paragraphs).
- Use bold for key scientific terms on first mention.
- Do NOT add a sources section — I'll add that separately.

CONTEXT DOCUMENTS:
${contextParts.join('\n\n')}

USER QUESTION: ${question}

Answer as Chef Scientia:`;

    console.log('[Chef] Calling Claude CLI for AI-powered answer...');
    const rawAnswer = await this.callClaude(prompt);

    if (!rawAnswer) {
      console.log('[Chef] Claude CLI returned empty, falling back to template');
      return this.synthesizeAnswer(question, chunks, citations, false);
    }

    // Append sources section
    const sourcesSection = citationManager.formatSourcesSection(citations);
    return rawAnswer + '\n\n' + sourcesSection;
  }

  /**
   * Fallback: Template-based answer synthesis (no LLM needed)
   */
  private synthesizeAnswer(
    question: string,
    chunks: RetrievedChunk[],
    citations: Citation[],
    conflictDetected: boolean
  ): string {
    if (chunks.length === 0) {
      return this.handleNoResults(question);
    }

    const sourceToIdx = new Map<string, number>();
    for (const c of citations) {
      sourceToIdx.set(c.source_url || c.title, c.index);
    }

    const questionWords = this.extractKeywords(question);
    const rankedChunks = chunks
      .map(chunk => {
        const text = this.cleanChunkText(chunk.chunk.text);
        const title = chunk.chunk.metadata.title.toLowerCase();
        const titleWords = this.extractKeywords(title);
        const textWords = this.extractKeywords(text);
        const titleOverlap = [...questionWords].filter(w => titleWords.has(w)).length;
        const textOverlap = [...questionWords].filter(w => textWords.has(w)).length;
        const relevance = (titleOverlap * 3) + textOverlap;
        return { chunk, text, relevance, citIdx: sourceToIdx.get(chunk.chunk.metadata.source_url || chunk.chunk.metadata.title) || 0 };
      })
      .sort((a, b) => b.relevance - a.relevance);

    const primary = rankedChunks[0];
    const secondary = rankedChunks.length > 1 ? rankedChunks[1] : null;

    let answer = '';
    const qLower = question.toLowerCase();
    if (qLower.startsWith('why') || qLower.includes('why ')) {
      answer += `**Great question!** Let me explain the science behind this.\n\n`;
    } else if (qLower.startsWith('how')) {
      answer += `**Excellent question!** Here's how this works from a food science perspective.\n\n`;
    } else if (qLower.includes('safe')) {
      answer += `**Important food safety question!** Here's what the science says.\n\n`;
    } else if (qLower.includes('substitut')) {
      answer += `**Good question about substitutions!** Let me walk you through the science.\n\n`;
    } else {
      answer += `**Here's what food science tells us.**\n\n`;
    }

    const primarySentences = this.extractBestSentences(primary.text, questionWords, 6);
    if (primarySentences.length > 0) {
      answer += primarySentences.join(' ');
      if (primary.citIdx > 0) answer += ` [${primary.citIdx}]`;
      answer += '\n\n';
    }

    if (secondary && secondary.relevance > 0 && secondary.chunk.chunk.metadata.title !== primary.chunk.chunk.metadata.title) {
      const secondarySentences = this.extractBestSentences(secondary.text, questionWords, 3);
      if (secondarySentences.length > 0) {
        answer += secondarySentences.join(' ');
        if (secondary.citIdx > 0) answer += ` [${secondary.citIdx}]`;
        answer += '\n\n';
      }
    }

    if (conflictDetected) {
      answer += `\n**Note:** Some sources provide slightly different perspectives on this topic.\n\n`;
    }

    if (['safe', 'danger', 'temperature', 'raw', 'allergen', 'toxic', 'bacteria'].some(kw => qLower.includes(kw))) {
      answer += `\n**Food Safety Note:** When in doubt, always err on the side of caution. Use a food thermometer and consult USDA guidelines.\n`;
    }

    const usedCitIdxs = new Set<number>();
    if (primary.citIdx > 0) usedCitIdxs.add(primary.citIdx);
    if (secondary?.citIdx && secondary.citIdx > 0) usedCitIdxs.add(secondary.citIdx);
    answer += citationManager.formatSourcesSection(citations.filter(c => usedCitIdxs.has(c.index)));

    return answer.trim();
  }

  private extractBestSentences(text: string, queryWords: Set<string>, maxSentences: number): string[] {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 25 && s.length < 500)
      .filter(s => !this.isBoilerplate(s));

    if (sentences.length === 0) return [];

    const scored = sentences.map(s => {
      const words = this.extractKeywords(s);
      const overlap = [...queryWords].filter(w => words.has(w)).length;
      const scienceBoost = /\b(degree|celsius|fahrenheit|molecule|protein|enzyme|bacteria|temperature|reaction|process|because|therefore)\b/i.test(s) ? 1 : 0;
      return { sentence: s, score: overlap + scienceBoost };
    });

    scored.sort((a, b) => b.score - a.score);
    const topSentences = scored.slice(0, maxSentences);
    const originalOrder = sentences.map(s => s);
    topSentences.sort((a, b) => originalOrder.indexOf(a.sentence) - originalOrder.indexOf(b.sentence));
    return topSentences.map(s => s.sentence);
  }

  private isBoilerplate(s: string): boolean {
    return (
      /\b(pursuant|hereby|thereof|herein|subparagraph|subsection)\b/i.test(s) ||
      /\b(shall\s+be|burden\s+shall|secretary\s+shall)\b/i.test(s) ||
      /^\s*\([A-Z]\)\s/.test(s) ||
      /U\.S\.C|Federal Register|CFR|Public Law/i.test(s) ||
      /labeling.*requirements|regulation.*section/i.test(s.toLowerCase()) ||
      s.split(' ').length < 5 ||
      /^``\([A-Z0-9]\)/.test(s)
    );
  }

  private cleanChunkText(text: string): string {
    return text
      .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
      .replace(/\u2014/g, '—').replace(/\u2019/g, "'").replace(/\u201c|\u201d/g, '"')
      .replace(/\s+/g, ' ')
      .replace(/Print & Share.*?(?=\.|$)/gi, '')
      .replace(/``\([A-Z]\)/g, '')
      .trim();
  }

  private extractKeywords(text: string): Set<string> {
    const stops = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'need', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'between', 'out', 'off', 'up', 'down', 'about',
      'than', 'too', 'very', 'just', 'but', 'and', 'or', 'if', 'when',
      'where', 'what', 'which', 'who', 'how', 'why', 'all', 'each',
      'every', 'some', 'any', 'no', 'not', 'only', 'so', 'that', 'this',
      'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'you',
      'your', 'my', 'his', 'her', 'make', 'get', 'tell', 'know', 'work',
    ]);
    return new Set(
      text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
        .filter(w => w.length > 2 && !stops.has(w))
    );
  }

  private handleNoResults(question: string): string {
    const foodTerms = ['cook', 'food', 'eat', 'bake', 'fry', 'boil', 'grill', 'roast',
      'ingredient', 'recipe', 'kitchen', 'meal', 'dish', 'flavor', 'taste', 'nutrition',
      'safe', 'temperature', 'meat', 'vegetable', 'fruit', 'bread', 'egg', 'milk',
      'butter', 'oil', 'salt', 'sugar', 'flour', 'spice', 'herb', 'sauce', 'soup',
      'microwave', 'oven', 'stove', 'refrigerat', 'freez', 'thaw', 'marinate',
      'ferment', 'preserve', 'pickle', 'smoke', 'cure', 'dehydrat',
      'protein', 'vitamin', 'calorie', 'carb', 'fat', 'fiber', 'mineral',
      'chocolate', 'coffee', 'tea', 'wine', 'beer', 'cheese', 'yogurt', 'cream'];
    const qLower = question.toLowerCase();
    const isFoodRelated = foodTerms.some(t => qLower.includes(t));

    if (isFoodRelated) {
      return `**Great question!** While this is definitely a food science topic, I don't currently have enough verified information in my knowledge base to give you a properly cited answer.\n\n**Suggested resources:**\n- Harold McGee's "On Food and Cooking"\n- USDA FoodData Central (fdc.nal.usda.gov)\n- FDA.gov food safety guidelines\n\nI'd rather be honest than give you unverified information!`;
    } else {
      return `I'm **Chef Scientia** — an AI specialized in **food science, cooking chemistry, nutrition, and food safety**.\n\nI can help with questions like:\n- "Why does bread go stale?" (food chemistry)\n- "What temperature kills salmonella?" (food safety)\n- "Can I substitute butter with coconut oil?" (cooking technique)\n- "Why do onions make you cry?" (food chemistry)\n\nFeel free to ask me anything about the science behind cooking and food!`;
    }
  }

  async answerWithSafetyConstraints(question: string, safetyFlags: string[]): Promise<ChefResponse> {
    console.log(`[Chef] Re-generating with safety constraints`);
    const response = await this.answer(question);
    let safeAnswer = response.answer;

    if (safetyFlags.some(f => f.includes('temperature'))) {
      safeAnswer = `**Important:** Always follow USDA recommended cooking temperatures.\n\n` + safeAnswer;
    }
    if (safetyFlags.some(f => f.includes('allergen'))) {
      safeAnswer = `**Allergy Warning:** Consult your healthcare provider for food allergies.\n\n` + safeAnswer;
    }
    return { ...response, answer: safeAnswer };
  }
}

export const chefAgent = new ChefAgent();
