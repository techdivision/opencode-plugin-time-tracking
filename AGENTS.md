# AGENTS.md

## Build Commands

```bash
npm install
npx tsc --noEmit
```

## Code Style

- TypeScript strict mode, ESNext target
- No build step — Bun loads `.ts` files directly
- Use `import type` for type-only imports
- Use `Record<string, string>` for key-value maps
- Never throw in plugin hooks — all errors must be caught silently
- Never overwrite existing environment variables
- No external dependencies beyond `@opencode-ai/plugin` and Node.js built-ins
- Source code lives in `src/`, never in `plugins/`
