# Contributing to Claude Code Orchestrator

Thank you for contributing to CCOrch! This guide will help you maintain code quality and consistency.

## Commit Format

We use **Conventional Commits** for all commits:

```
<type>(<scope>): <subject>

<optional body>

<optional footer>
```

**Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`

**Example**:
```
feat(orchestrator): implement chain resolver for workflow routing

- Add chain determination logic based on user prompt analysis
- Support all 9 workflow chains (backend-dev, frontend-dev, etc.)
- Include complexity level resolution (simple/moderate/complex)

Resolves: #12
```

**Commit Frequency**: Commit every ~200 lines or single feature completion.

## TDD Workflow

Follow the **red-green-refactor** cycle:

1. **Red**: Write a failing test first
   ```typescript
   describe('ChainResolver', () => {
     it('should resolve backend-development chain for API prompts', () => {
       const result = chainResolver.resolve('Implement REST API');
       expect(result.chain).toBe('backend-development');
     });
   });
   ```

2. **Green**: Write minimal code to make the test pass

3. **Refactor**: Improve code while keeping tests green

**Coverage Target**: ≥80% statement coverage (enforced in CI)

## Quality Checklist

Run these commands **before every commit**:

```bash
pnpm lint           # ESLint checks
pnpm type-check     # TypeScript type integrity
pnpm test           # Run all tests
```

Or run all at once:
```bash
pnpm lint && pnpm type-check && pnpm test
```

## PR Review Process

### Requirements for PR Approval

- [ ] All tests pass (`pnpm test`)
- [ ] Coverage ≥80% (`pnpm test:coverage`)
- [ ] Lint clean (`pnpm lint`)
- [ ] Type check clean (`pnpm type-check`)
- [ ] CI green (GitHub Actions)
- [ ] Conventional commits used
- [ ] Code reviewed by at least one maintainer

### Approval Process

1. Create PR from feature branch to `main`
2. Wait for CI checks to complete
3. Address review feedback
4. Obtain approval from maintainer
5. Squash and merge

## Development Workflow

### Initial Setup

```bash
git clone <repository-url>
cd ccorch
pnpm install
cp .env.example .env
# Edit .env with your configuration
pnpm prisma migrate dev
pnpm test
```

### Daily Development

```bash
# Start development server
pnpm dev

# Run tests in watch mode
pnpm test:watch

# Check code quality
pnpm lint && pnpm type-check
```

## Code Style Guidelines

### TypeScript

- Use strict TypeScript (`strict: true`)
- Prefer interfaces for public APIs
- Use type aliases for complex types
- Avoid `any` (use `unknown` if needed)
- Add JSDoc comments for public functions

### Naming Conventions

- **Files**: kebab-case (`chain-resolver.ts`)
- **Classes**: PascalCase (`ChainResolver`)
- **Functions**: camelCase (`resolveChain`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Interfaces**: PascalCase with `I` prefix (`IWorkflowRepository`)

### Project Structure

```
src/
├── config/          # Configuration (database, env)
├── models/          # Data models and repositories
├── services/        # Business logic (orchestrator, state manager)
├── hooks/           # Claude Code hook handlers
├── api/             # Express routes and middleware
├── utils/           # Helpers (logger, parser, templates)
└── types/           # TypeScript type definitions
```

## Architecture Patterns

### Repository Pattern

Use interfaces for data access to enable future Redis migration:

```typescript
interface IWorkflowRepository {
  create(data: WorkflowCreateInput): Promise<Workflow>;
  findById(id: string): Promise<Workflow | null>;
  updateStatus(id: string, status: WorkflowStatus): Promise<Workflow>;
}
```

### Dependency Injection

Inject dependencies via constructor:

```typescript
class Orchestrator {
  constructor(
    private readonly parser: PromptParser,
    private readonly resolver: ChainResolver,
    private readonly stateManager: StateManager
  ) {}
}
```

### Error Handling

- Use custom error classes for domain errors
- Wrap external errors (Prisma, network) with context
- Always log errors with structured data (pino)
- Return appropriate HTTP status codes (400, 404, 500)

## Additional Resources

- **CLAUDE.md**: Project overview and architecture
- **docs/PRD.md**: Product requirements and workflow chains
- **docs/technical-spec.md**: Technical implementation details
- **docs/development-plan.md**: Development phases and timeline
- **docs/WBS.md**: Granular task breakdown

## Questions?

If you have questions or need clarification, please:
1. Check existing documentation (CLAUDE.md, docs/)
2. Review similar code in the codebase
3. Open an issue for discussion
4. Ask in team chat

Thank you for contributing! 🎉
