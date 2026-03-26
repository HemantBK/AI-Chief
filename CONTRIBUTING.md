# Contributing to Chef Scientia

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/ai-chef.git`
3. Install dependencies: `npm install`
4. Copy env file: `cp .env.example .env`
5. Start dev server: `npm run dev`

## How to Contribute

### Adding Food Science Content
The easiest way to contribute is by adding new food science lectures in `src/ingestion/sources/lectures.ts`. Each lecture should:
- Be 200-400 words of substantive food science content
- Include specific temperatures, chemical names, and mechanisms
- Be categorized as `chemistry`, `safety`, `technique`, or `nutrition`

### Bug Fixes
1. Create a branch: `git checkout -b fix/description`
2. Make your changes
3. Run tests: `npm test`
4. Submit a pull request

### New Features
1. Open an issue first to discuss the feature
2. Create a branch: `git checkout -b feature/description`
3. Write tests for new functionality
4. Submit a pull request

## Code Style
- TypeScript with strict mode
- ESM imports with `.js` extensions
- No unnecessary abstractions — keep it simple

## Safety-Critical Changes
Changes to the safety system (`src/safety/`) require extra scrutiny:
- Do not lower safety thresholds without justification
- Add test cases for any new safety patterns
- Never remove existing dangerous advice patterns from `data/safety-patterns.json`
