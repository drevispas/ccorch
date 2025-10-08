# Repository Guidelines

## Project Structure & Module Organization
Place runtime code under `src/`, grouping by capability: `src/services/` for orchestration logic (chain resolution, state management), `src/hooks/` for Claude Code hook adapters, `src/api/` for Express routes, `src/models/` for Prisma repositories, `src/middleware/` for Express middleware (auth, error handling), and `src/types/` for shared TypeScript types. Keep environment helpers in `src/config/` and utilities in `src/utils/`. Tests mirror the module tree in `tests/` using `*.test.ts` files. Generated Prisma schema and migrations live in `prisma/`. Documentation, product context, and runbooks stay under `docs/` (see `docs/01-product-PRD.md` and `docs/03-planning-development-plan.md`). Agent prompt templates are managed in Claude Code's `.claude/agents/` directory; commit only references, not the raw prompt files.

## Build, Test, and Development Commands
Install dependencies with `pnpm install`. Launch the API locally via `pnpm dev`, which should start the Express server and watch TS changes. Run the orchestrator in production mode using `pnpm start` after building with `pnpm build`. Execute all checks with `pnpm lint`, `pnpm test`, and `pnpm tsc --noEmit`; use `pnpm test --runInBand` when debugging hook flows. Regenerate Prisma artifacts using `pnpm prisma migrate dev` and `pnpm prisma generate`.

## Coding Style & Naming Conventions
Use TypeScript with 2-space indentation and strict compiler settings. Favor domain-driven naming: services (`WorkflowStateService`), repositories (`WorkflowRepository`), and hooks (`userPromptSubmitHandler`). Files are kebab-case (`workflow-state.service.ts`), test files append `.spec.ts`. Prefer immutable patterns; log via `pino`. Format code through ESLint/Prettier (`pnpm lint --fix`) before committing.

## Testing Guidelines
Adopt TDD. Write unit tests in Vitest, grouping by module under `tests/{area}`. Integration tests target hook flows with Supertest and seed data via SQLite. Maintain >=80% statement coverage; fail the pipeline if `pnpm vitest --coverage` drops below the threshold. Test names follow `should_<expected_behaviour>` to document orchestration decisions.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat`, `fix`, `chore`, etc.) and keep subjects <=72 chars. Reference workflow IDs or issues in the footer (`Resolves: #123`). Each PR needs a summary of the orchestrated chain impacted, test evidence (`pnpm test` output), and screenshots or curl logs when adjusting API responses. Request review from another agent owner before merge.

## Configuration & Security Notes
Store secrets in `.env` (never commit); expose typed access via `src/config/env.ts`. Use API keys for admin transitions and redact them from logs. When adding new agent roles or complexities, update configuration validation so startup checks assert all 21 agent configurations (7 roles × 3 complexity levels).
