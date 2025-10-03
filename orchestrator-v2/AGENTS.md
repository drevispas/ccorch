# Repository Guidelines

## Project Structure & Module Organization
- `core/` holds the orchestration engine (state, workflow, execution, integration). Keep new runtime primitives here.
- `agents/` contains the six plugin modules; follow existing capability folders when adding a skill.
- `server/` exposes the HTTP/WebSocket API; shared schemas live in `server/schemas` and reuse `core` types.
- `tests/` mirrors the runtime domains (`state/`, `plugins/`, `integration/`, etc.); place fixtures under `tests/helpers`.
- `docs/`, `examples/`, and `scripts/` document and automate refactoring sessions. Generated assets belong in `dist/` or `coverage/`.

## Build, Test, and Development Commands
- `npm install` – resolve all TypeScript and tooling dependencies.
- `npm run dev` – start the API/WebSocket server via `tsx` with live reload.
- `npm run build` – emit production bundles into `dist/` using `tsc`.
- `npm test` / `npm run test:watch` – execute the Jest multi-project suite once or in watch mode.
- `npm run lint` and `npm run typecheck` – enforce ESLint + `tsc --noEmit` before committing.
- `npm run openapi:generate` – refresh API documentation when contracts change.

## Coding Style & Naming Conventions
- TypeScript everywhere; use 2-space indentation and adhere to strict null safety.
- Prefer `camelCase` for functions/variables, `PascalCase` for classes/types, and `SCREAMING_SNAKE_CASE` only for frozen constants.
- Avoid `any`; if unavoidable, document the reason. Respect ESLint rules in `.eslintrc.json`, especially `@typescript-eslint/no-unused-vars` with `_`-prefixed escapes.
- Keep side effects out of module scope; expose pure helpers from `core` and wire integrations inside `server/`.

## Testing Guidelines
- Jest configuration lives in `jest.config.js` with `unit` and `integration` projects. Match test files to their domain folder (e.g., `tests/plugins/my-plugin.test.ts`).
- Use `npm run test:coverage` when introducing new modules; aim to keep coverage reports green and stored under `coverage/`.
- Follow Arrange/Act/Assert structure and seed orchestrator state via helpers in `tests/setup.ts`.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat:`, `fix:`, `docs:`) as seen in recent history; scope your subject to ~72 characters.
- Include what changed, why, and test evidence in PR descriptions. Link session checklists or issues when relevant and attach screenshots for API/UI regressions.
- Ensure lint, typecheck, and targeted Jest phases (`npm run test:phase1` etc.) pass before requesting review.

## Agent Plugin Extension Tips
- Register new capabilities through the plugin manifest in `agents/index.ts` and export types from `core/plugins`.
- Provide configuration defaults under `core/state/schemas` and document the behavior in `docs/SESSION-*.md` as appropriate.
