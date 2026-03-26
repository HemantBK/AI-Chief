# Chef Scientia — AI Food Science Assistant

A full-stack AI application that answers food science questions with science-backed, cited answers and real-time safety monitoring. Built with a multi-agent RAG pipeline, dangerous advice detection, and an observability dashboard.

Ask questions like *"Why does bread go stale?"*, *"Can I substitute butter with coconut oil?"*, or *"Is it safe to eat raw eggs?"* and get accurate, cited explanations of the science behind cooking.

![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)
![Node.js](https://img.shields.io/badge/Node.js-22+-339933)
![Fastify](https://img.shields.io/badge/Fastify-5.0-000000)
![License](https://img.shields.io/badge/License-MIT-green)
![Status](https://img.shields.io/badge/Status-Prototype-orange)

---

## Screenshots

<details>
<summary>Chat Interface</summary>

The main interface where users ask food science questions and receive cited, safety-scored answers.

```
┌──────────────────────────────────────────────────────┐
│  🧑‍🍳 Chef Scientia          [Chat]  [Dashboard]       │
├──────────────────────────────────────────────────────┤
│                                                      │
│         ┌──────────────────────────────┐             │
│         │ Why does bread go stale?     │  ← User     │
│         └──────────────────────────────┘             │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │ Chef Scientia                               │     │
│  │                                             │     │
│  │ Bread staling is driven by **starch         │     │
│  │ retrogradation** — a molecular              │     │
│  │ rearrangement that occurs independently     │     │
│  │ of moisture loss... [1]                     │     │
│  │                                             │     │
│  │ 🟢 92 High Confidence                       │     │
│  │ ▼ 1 source cited                           │     │
│  │ [LECTURE] Bread Staling: Starch...          │     │
│  │                                    👍 👎    │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  ┌────────────────────────────────────┐ [Send]       │
│  │ Ask a food science question...     │              │
│  └────────────────────────────────────┘              │
└──────────────────────────────────────────────────────┘
```

</details>

<details>
<summary>Monitoring Dashboard</summary>

Real-time observability into safety scores, query categories, and flagged responses.

```
┌──────────────────────────────────────────────────────┐
│  🧑‍🍳 Chef Scientia          [Chat]  [Dashboard]       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│  │  0.85  │ │   42   │ │    3   │ │  32ms  │        │
│  │ Safety │ │Queries │ │ Flags  │ │  Avg   │        │
│  │  Avg   │ │ Total  │ │ Total  │ │Response│        │
│  └────────┘ └────────┘ └────────┘ └────────┘        │
│                                                      │
│  Safety Score Trend          Category Distribution   │
│  ┌──────────────────┐    ┌──────────────────┐        │
│  │ 1.0─             │    │  Chemistry ██ 35%│        │
│  │     ╱╲  ╱╲       │    │  Safety    ██ 30%│        │
│  │ 0.5─╱  ╲╱  ╲─    │    │  Technique ██ 25%│        │
│  │ 0.0─────────     │    │  Nutrition █  10%│        │
│  └──────────────────┘    └──────────────────┘        │
│                                                      │
│  Recent Safety Flags                                 │
│  ┌──────────────────────────────────────────────┐    │
│  │ Query              │ Score │ Flag             │    │
│  │ "raw chicken safe" │ 0.25  │ Temperature low  │    │
│  │ "leave rice out"   │ 0.31  │ Danger zone      │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

</details>

---

## Features

**AI-Powered Q&A**
- Retrieval-Augmented Generation (RAG) pipeline with HNSW semantic routing
- 144+ knowledge chunks from USDA, FDA, Semantic Scholar, and curated food science lectures
- Inline citations `[1]` with source links for every answer
- Graceful "I don't know" responses when knowledge is insufficient (relevance gate)
- Optional Claude CLI integration for LLM-powered answers (Max plan, $0 extra cost)

**Multi-Agent System**
- **Chef Agent** — generates science-backed answers from retrieved context
- **Safety Reviewer** — checks every response for dangerous food advice
- **Citation Verifier** — validates that sources actually support the claims
- **Coordinator** — orchestrates agents in a star topology with veto power on unsafe responses

**Safety Monitoring**
- Safety confidence score (0.0–1.0) on every response, computed from 4 weighted signals
- 20+ dangerous advice patterns (e.g., "raw chicken is safe if fresh")
- Conflicting retrieval detection across sources
- SONA adaptive threshold — system automatically gets more cautious over time
- USDA minimum temperature validation
- Safety veto: responses scoring below 0.3 are blocked and re-generated with stricter constraints

**Monitoring Dashboard**
- Safety score trend line chart
- Query category distribution (pie chart)
- Flagged responses table with details
- System health metrics (total queries, avg response time, avg safety score)
- Auto-refreshes every 30 seconds

**User Feedback Loop**
- Thumbs up/down on every response
- Feedback feeds into SONA adaptation for continuous improvement
- Stored in SQLite for analysis

---

## How It Works

This application uses a **Retrieval-Augmented Generation (RAG)** pipeline with a multi-agent safety layer. Here's the flow:

### 1. Query Routing
When a user asks a question, the **HNSW semantic router** compares the query embedding against 4 category anchor embeddings (chemistry, safety, technique, nutrition) to determine which knowledge namespace(s) to search. If confidence is low, it searches all namespaces.

### 2. Retrieval & Reranking
The **retriever** searches the top-2 namespaces using cosine similarity against 384-dimensional embeddings. The **reranker** then:
- Re-scores chunks by embedding similarity to the query
- Applies a **relevance gate** — chunks scoring below 0.15 are discarded (this prevents random FDA text from appearing in unrelated answers)
- Detects conflicting information across sources

### 3. Answer Generation
The **Chef Agent** synthesizes an answer from the retrieved chunks. Two modes:
- **Claude CLI mode** (if available): Sends chunks + question to Claude via `claude --print`, producing fluent, reasoned answers. Uses your Max plan — $0 extra cost.
- **Template mode** (fallback): Extracts the most relevant sentences from chunks using keyword scoring and assembles them into a structured answer.

### 4. Safety Review (Parallel)
Two agents review the answer simultaneously:
- **Safety Reviewer**: Checks against 20+ dangerous advice patterns, validates temperatures against USDA minimums, checks for appropriate hedging language on safety topics, and computes the weighted safety score.
- **Citation Verifier**: For each `[1]`, `[2]` citation, verifies the source chunk actually supports the claim. Invalid citations are stripped.

### 5. Response Decision
The **Coordinator** merges results:
- Safety score >= 0.7 → Serve normally (green badge)
- Safety score 0.3–0.7 → Serve with warning flags (yellow badge)
- Safety score < 0.3 → **Veto** the response, re-generate with stricter safety constraints (up to 3 attempts)

---

## Example Q&As

<details>
<summary><b>"Why does bread go stale?"</b> — Safety: 0.925</summary>

> **Great question!** Let me explain the science behind this.
>
> Bread staling is one of the most misunderstood processes in food science. Most people assume bread goes stale because it dries out, but the primary mechanism is actually **starch retrogradation** — a molecular rearrangement that occurs independently of moisture loss. During baking, starch granules absorb water and gelatinize. Once cooled, amylose and amylopectin molecules begin reassociating into ordered crystalline structures.
>
> Temperature plays a critical role. Retrogradation occurs fastest between 0 and 4 degrees Celsius — precisely refrigerator temperature. This is why refrigerating bread accelerates staling. Freezing, by contrast, halts retrogradation by immobilizing the water molecules. [1]
>
> *Source: [LECTURE] Bread Staling: The Science of Starch Retrogradation*

</details>

<details>
<summary><b>"Why do onions make you cry?"</b> — Safety: 0.925</summary>

> **Great question!** Let me explain the science behind this.
>
> Chopping onions triggers a remarkable chemical defense system that evolved to deter herbivores. The tear-inducing process involves a cascade of enzymatic reactions that ultimately produce **syn-propanethial-S-oxide**, the volatile lachrymatory factor that irritates your eyes.
>
> When you cut an onion, you rupture cells, releasing the enzyme **alliinase**. This enzyme converts amino acid sulfoxides into sulfenic acids, which are then rapidly rearranged by a second enzyme (lachrymatory factor synthase) into the volatile gas that reaches your eyes and triggers tearing. [1]
>
> *Source: [LECTURE] Why Onions Make You Cry: Lachrymatory Factor Chemistry*

</details>

<details>
<summary><b>"How does the stock market work?"</b> — Correctly declined</summary>

> I'm **Chef Scientia** — an AI specialized in **food science, cooking chemistry, nutrition, and food safety**.
>
> I can help with questions like:
> - "Why does bread go stale?" (food chemistry)
> - "What temperature kills salmonella?" (food safety)
> - "Can I substitute butter with coconut oil?" (cooking technique)
> - "Why do onions make you cry?" (food chemistry)

</details>

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Server | Fastify 5 + TypeScript | High-performance API with schema validation |
| Embeddings | Custom semantic embedder (384-dim, FNV-1a hashing) | Document and query vectorization |
| Vector Search | HNSW category router | Fast approximate nearest-neighbor routing |
| Knowledge Store | SQLite (better-sqlite3) + in-memory cache | Persistent storage with fast cosine similarity search |
| Safety | Pattern matching + confidence scoring + SONA | Multi-signal safety evaluation |
| Frontend | Vanilla JS + Chart.js 4.x | Zero-build-step UI with monitoring charts |
| Data Sources | USDA FoodData Central, FDA.gov, Semantic Scholar | Authoritative food science data |

---

## Prerequisites

- **Node.js** >= 18.0.0 (tested on v22.12.0)
- **npm** >= 9.0.0
- **Operating System**: Windows, macOS, or Linux
- **Optional**: Claude CLI (for AI-powered answers via Max plan)

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ai-chef.git
cd ai-chef

# Install dependencies
npm install

# (Optional) Configure environment variables
cp .env.example .env
# Edit .env — see Environment Variables section below

# Start the development server
npm run dev

# Open in browser
# http://localhost:3000
```

The server automatically on first start:
1. Creates SQLite database (`data/knowledge.db`)
2. Seeds 20 dangerous advice safety patterns
3. Ingests 37 curated food science lectures (~144 chunks)
4. Scrapes FDA food safety documents
5. Fetches USDA nutrition data and open-access papers
6. Builds the HNSW semantic router with 4 category anchors
7. Starts serving on port 3000

Subsequent starts load from SQLite instantly (no re-ingestion needed).

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `USDA_API_KEY` | No | `DEMO_KEY` | USDA FoodData Central API key. Free at [fdc.nal.usda.gov](https://fdc.nal.usda.gov/api-key-signup.html). `DEMO_KEY` works but has lower rate limits. |
| `PORT` | No | `3000` | Server port |
| `HOST` | No | `0.0.0.0` | Server host |
| `NODE_ENV` | No | `development` | Environment mode |
| `API_KEY` | No | *(none)* | If set, all API requests require `Authorization: Bearer <key>` header |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ask` | Ask a food science question |
| `GET` | `/api/health` | System health and knowledge stats |
| `GET` | `/api/metrics` | Dashboard metrics data |
| `GET` | `/api/metrics/safety-flags` | Recent safety-flagged queries |
| `POST` | `/api/feedback` | Submit thumbs up/down on a response |

### Example Request

```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Why does bread go stale?"}'
```

### Example Response

```json
{
  "success": true,
  "data": {
    "answer": "Bread staling is driven by starch retrogradation...",
    "citations": [
      {
        "index": 1,
        "title": "Bread Staling: Starch Retrogradation",
        "source_type": "lecture",
        "source_url": "curated://ai-chef/food-science-lectures"
      }
    ],
    "safety_score": 0.925,
    "safety_flags": [],
    "conflict_detected": false,
    "categories_searched": ["chemistry"],
    "response_time_ms": 32
  }
}
```

---

## Architecture

```
User Question
     │
     ▼
┌─────────────────────┐
│   Fastify API        │
│   POST /api/ask      │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│   Coordinator        │  ← Orchestrates all agents (star topology)
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│   RAG Engine         │
│  ┌───────────────┐   │
│  │ HNSW Router   │   │  ← Routes query to best knowledge category
│  │ Retriever     │   │  ← Searches top-2 namespaces (5 chunks each)
│  │ Reranker      │   │  ← Cosine similarity reranking + conflict detection
│  │ Relevance Gate│   │  ← Discards chunks below 0.15 threshold
│  └───────────────┘   │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│   Chef Agent         │  ← Claude CLI (Max plan) or template synthesis
└─────────┬───────────┘
          ▼
┌────────────┬────────────┐
│  Safety    │  Citation   │  ← Parallel review
│  Reviewer  │  Verifier   │
└────────────┴────────────┘
          │
          ▼
┌─────────────────────┐
│  Coordinator Decision│
│  score >= 0.7 → serve│
│  score < 0.3 → veto │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  Final Response      │
│  answer + citations  │
│  + safety score      │
│  + feedback buttons  │
└─────────────────────┘
```

---

## Knowledge Namespaces

| Namespace | Chunks | Content | Source |
|-----------|--------|---------|--------|
| `food-chemistry` | ~20 | Maillard reaction, starch retrogradation, emulsions, pH effects, caramelization, food coloring | Curated lectures |
| `food-safety` | ~65 | Cooking temperatures, contamination, allergens, storage, FDA guidelines | FDA.gov (scraped) |
| `cooking-technique` | ~29 | Substitutions, baking science, microwave physics, spice science, sous vide | Curated lectures |
| `nutrition-data` | ~10 | Nutrient profiles, vitamins, minerals, macros | USDA FoodData Central |
| `safety-patterns` | 20 | Known dangerous food advice patterns for detection | Hand-curated |

**Total: ~144 chunks across 5 namespaces**

---

## Safety Scoring

Every response gets a safety confidence score (0.0–1.0), computed as a weighted average of four signals:

```
safety_score = 0.35 × pattern_match    (no match with known dangerous patterns)
             + 0.25 × source_authority  (USDA/FDA = 1.0, paper = 0.9, lecture = 0.7)
             + 0.25 × consistency       (no conflicting retrievals across sources)
             + 0.15 × hedging           (appropriate caution language present)
```

| Score | Badge | Action |
|-------|-------|--------|
| 0.7–1.0 | Green "High Confidence" | Response served normally |
| 0.3–0.7 | Yellow "Review Suggested" | Response served with safety flags shown |
| 0.0–0.3 | Red "Safety Concern" | Response **vetoed** and re-generated with stricter constraints (up to 3 attempts) |

### Dangerous Advice Patterns (examples)

The system detects and flags responses that match patterns like:
- *"Raw chicken is safe if it's fresh"*
- *"You can leave cooked food at room temperature for hours"*
- *"Home canning without pressure is safe for low-acid foods"*
- *"You can tell if food is safe by smelling it"*
- *"Freezing kills all bacteria and parasites"*

---

## Project Structure

```
ai-chef/
├── src/
│   ├── agents/           # Multi-agent system
│   │   ├── chef.ts       #   Chef Agent — answer generation (Claude CLI or template)
│   │   ├── safety-reviewer.ts  #   Safety Reviewer — dangerous advice detection
│   │   ├── citation-verifier.ts #  Citation Verifier — source validation
│   │   └── coordinator.ts      #   Coordinator — orchestration + veto logic
│   ├── api/              # HTTP API layer
│   │   └── routes/       #   ask.ts, health.ts, metrics.ts
│   ├── ingestion/        # Data pipeline
│   │   ├── chunker.ts    #   Semantic paragraph chunking (300-500 tokens)
│   │   ├── embedder.ts   #   384-dim FNV-1a hash embeddings with caching
│   │   ├── loader.ts     #   SQLite-backed knowledge store
│   │   └── sources/      #   USDA, FDA, Semantic Scholar, curated lectures
│   ├── monitoring/       # Observability
│   │   ├── metrics.ts    #   Per-query metric collection
│   │   └── persistence.ts #  SQLite metrics + feedback storage
│   ├── rag/              # RAG engine
│   │   ├── router.ts     #   HNSW category router (4 anchors)
│   │   ├── retriever.ts  #   Multi-namespace search
│   │   ├── reranker.ts   #   Cosine similarity reranking + conflict detection
│   │   └── citation.ts   #   Citation extraction and formatting
│   ├── safety/           # Safety system
│   │   ├── confidence.ts #   Weighted safety scoring algorithm
│   │   ├── scanner.ts    #   Temperature + allergen + FDA validation
│   │   ├── conflict-detector.ts  # Contradictory retrieval flagging
│   │   └── adaptation.ts #   SONA adaptive threshold
│   ├── ui/               # Frontend (no build step)
│   │   ├── index.html    #   SPA shell (chat + dashboard views)
│   │   ├── styles.css    #   Warm cream/orange/teal theme
│   │   ├── app.js        #   Hash routing, API calls, auto-refresh
│   │   └── components/   #   chat.js, dashboard.js, safety badges
│   ├── config.ts         # Centralized configuration + thresholds
│   ├── types.ts          # TypeScript type definitions
│   └── index.ts          # Application entry point
├── data/
│   ├── knowledge.db      # SQLite database (auto-created)
│   └── safety-patterns.json  # Dangerous advice pattern seeds
├── scripts/              # Initialization + debug tools
├── tests/                # Vitest test suite
├── .env.example          # Environment variable template
├── package.json
├── tsconfig.json
├── LICENSE               # MIT
└── CONTRIBUTING.md
```

---

## Limitations & Known Issues

This is a **prototype / portfolio project**, not a production system. Key limitations:

| Limitation | Impact | Potential Fix |
|-----------|--------|---------------|
| **Hash-based embeddings** (not neural) | Keyword matching works but misses semantic nuance. "meat color" works because keywords overlap; subtle queries may fail. | Replace with ONNX neural embeddings (sentence-transformers) |
| **144 chunks is small** | Many valid food science topics have no coverage, triggering "I don't know" | Expand to 2000+ chunks with more papers and full USDA database |
| **No conversation memory** | Can't do follow-up questions like "what about chicken specifically?" | Add session state with message history |
| **FDA scraping is fragile** | FDA.gov page structure can change, breaking the scraper | Add error handling + fallback to cached content |
| **Single-user design** | No authentication, no user sessions, no multi-tenancy | Add user auth + session isolation |
| **Template answers lack fluency** | Without Claude CLI, answers are assembled from sentence extraction, not generated prose | Use Claude CLI (Max plan) or any local LLM |

---

## Roadmap

- [ ] Neural embeddings (ONNX sentence-transformers running locally)
- [ ] Expand knowledge base to 2000+ chunks
- [ ] Multi-turn conversation with session memory
- [ ] Claude CLI integration for LLM-powered answers
- [ ] Docker containerization
- [ ] User authentication and sessions
- [ ] Export conversation history
- [ ] Mobile-responsive improvements
- [ ] Webhook notifications for safety-critical flags
- [ ] A/B testing framework for answer quality

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

The easiest way to contribute is by **adding food science lectures** — see `src/ingestion/sources/lectures.ts` for the format.

---

## Acknowledgments

This project uses data from the following sources:

- **[USDA FoodData Central](https://fdc.nal.usda.gov/)** — Nutrient profiles and food composition data (public domain)
- **[U.S. Food and Drug Administration](https://www.fda.gov/)** — Food safety guidelines and regulations (public domain)
- **[Semantic Scholar](https://www.semanticscholar.org/)** — Open-access food science paper abstracts (API, free)
- **Harold McGee** — Foundational food science concepts referenced in curated lectures
- **[Chart.js](https://www.chartjs.org/)** — Dashboard visualizations (MIT license)

---

## License

[MIT](LICENSE) — see LICENSE file for details.
