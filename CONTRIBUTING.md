# Contributing to Claude Code Orchestrator

Thank you for contributing to the Claude Code Orchestrator! This document provides guidelines for maintaining code quality and consistency across the project.

## 1. Commit Format

We use **Conventional Commits** for all commits to maintain a clear and structured git history.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat** - New feature
- **fix** - Bug fix
- **refactor** - Code restructuring without behavior change
- **test** - Add or modify tests
- **docs** - Documentation changes
- **chore** - Build, tooling, dependencies
- **perf** - Performance improvement

### Commit Frequency

Commit frequently: **every single feature or ~200 lines of changes**

### Example

```
feat(orchestrator): implement chain resolver for workflow routing

- Add chain determination logic based on user prompt analysis
- Support all 9 workflow chains (backend-dev, frontend-dev, etc.)
- Include complexity level resolution (simple/moderate/complex)

Resolves: #12
```

## 2. Test-Driven Development (TDD)

**Write tests BEFORE implementation.** Follow the red-green-refactor cycle:

1. **Red**: Write a failing test
2. **Green**: Implement minimal code to pass the test
3. **Refactor**: Improve code while keeping tests green

### Example Test Structure

```typescript
import { describe, it, expect } from 'vitest';

describe('ChainResolver', () => {
  it('should resolve backend-development chain for API implementation prompts', () => {
    // Arrange
    const prompt = 'Implement REST API for authentication';
    const resolver = new ChainResolver();

    // Act
    const result = resolver.resolve(prompt);

    // Assert
    expect(result.chain).toBe('backend-development');
    expect(result.complexity).toBe('moderate');
  });
});
```

### Coverage Requirements

- Minimum **80% coverage** for statements, branches, functions, and lines
- Check coverage: `pnpm test:coverage`

## 3. Quality Checklist

Run these commands **before every commit**:

```bash
pnpm lint        # Check code style
pnpm type-check  # Verify TypeScript types
pnpm test        # Run all tests
```

All three must pass before committing.

### Auto-formatting

Format code with Prettier before committing:

```bash
pnpm format
```

## 4. Pull Request Process

### Before Creating a PR

1. **Ensure all tests pass**: `pnpm test`
2. **Check coverage**: `pnpm test:coverage` (≥80%)
3. **Lint and type-check**: `pnpm lint && pnpm type-check`
4. **Review your changes**: Self-review the diff for debugging code, TODOs, or secrets
5. **Update documentation**: If you changed functionality, update relevant docs

### PR Requirements

- **Descriptive title**: Use conventional commit format
- **Clear description**: Explain what changed and why
- **Link issues**: Reference related issues (e.g., "Resolves #42")
- **CI must pass**: All GitHub Actions checks must be green
- **Approval required**: At least one team member must approve

### PR Review Process

Reviewers will check for:
- Code correctness and edge case handling
- Test coverage (≥80%)
- Adherence to project patterns and conventions
- Documentation updates
- No sensitive data (API keys, secrets) committed

## 5. Development Workflow

### Setting Up Your Environment

```bash
# Clone the repository
git clone <repository-url>
cd orchestrator-v3

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Set up database
pnpm prisma migrate dev

# Run tests to verify setup
pnpm test
```

### Daily Development

```bash
# Start development server with hot reload
pnpm dev

# Run tests in watch mode
pnpm test:watch

# Run specific test file
pnpm test src/services/orchestrator.test.ts
```

## 6. Code Style Guidelines

### TypeScript

- **Use strict mode**: All code must pass `strict: true` in tsconfig.json
- **Explicit types**: Prefer explicit return types for public functions
- **Avoid `any`**: Use proper types or `unknown` with type guards
- **Functional patterns**: Prefer pure functions and immutability

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `chain-resolver.ts`)
- **Classes**: `PascalCase` (e.g., `ChainResolver`)
- **Functions**: `camelCase` (e.g., `resolveChain()`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_PORT`)
- **Interfaces**: `IPascalCase` (e.g., `IWorkflowRepository`)

### Comments

- **Why, not what**: Explain complex logic decisions, not obvious code
- **JSDoc for public APIs**: Document parameters, return types, and examples
- **TODOs**: Use `// TODO: description` for planned improvements

## 7. Architecture Patterns

### Repository Pattern

All database access must go through repository interfaces (see `src/types/repositories.ts`). This abstracts persistence and enables future migration to Redis.

### Dependency Injection

Services should accept dependencies via constructor injection:

```typescript
class Orchestrator {
  constructor(
    private parser: PromptParser,
    private resolver: ChainResolver,
    private stateManager: StateManager
  ) {}
}
```

### Error Handling

- Use custom error types for domain errors
- Wrap external errors with context
- Log errors with structured data (workflow ID, step, etc.)

## 8. Additional Resources

- **Project Documentation**: See `docs/` directory for PRD, technical spec, and architecture
- **Claude Code Patterns**: Refer to `CLAUDE.md` for AI assistant guidance
- **Hook Reference**: [Claude Code Hooks Documentation](https://docs.claude.com/en/docs/claude-code/hooks-guide.md)

## 9. Questions?

If you have questions or need clarification on any guidelines:

1. Check existing documentation in `docs/`
2. Review similar code patterns in the codebase
3. Open a discussion in GitHub Issues
4. Reach out to the core team

Thank you for contributing and helping improve Claude Code Orchestrator!
