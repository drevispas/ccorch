# CCOrch Release Checklist

This checklist ensures CCOrch releases meet quality, security, and performance standards before deployment to production.

## Version Information

- **Version**: ___________
- **Release Date**: ___________
- **Release Manager**: ___________

---

## Pre-Release Validation

### 1. Code Quality

- [ ] **All tests pass**
  ```bash
  pnpm test
  ```
  - Expected: 478/478 unit tests pass
  - Expected: 47+ integration tests pass

- [ ] **Coverage ≥80%**
  ```bash
  pnpm test:coverage
  ```
  - Expected: Production code coverage 85-90%
  - Check: `coverage/index.html` for detailed report

- [ ] **Linting clean**
  ```bash
  pnpm lint
  ```
  - Expected: 0 errors (warnings acceptable for test files)

- [ ] **Type checking clean**
  ```bash
  pnpm type-check
  ```
  - Expected: 0 errors in source files (`src/`)
  - Note: Test file type errors acceptable if tests pass

- [ ] **Build succeeds**
  ```bash
  pnpm build
  ```
  - Expected: TypeScript compilation successful
  - Expected: `dist/` directory created with compiled JS

### 2. Continuous Integration

- [ ] **CI pipeline passes**
  - Check: GitHub Actions status for latest commit
  - URL: https://github.com/[org]/ccorch/actions
  - Expected: All checks green (lint, type-check, test, coverage)

- [ ] **No merge conflicts**
  - Check: Branch is up-to-date with main
  - Run: `git fetch origin && git status`

### 3. Documentation Review

- [ ] **All documentation up-to-date**
  - [ ] `README.md` - Installation and quick start
  - [ ] `CLAUDE.md` - Project overview and development guidelines
  - [ ] `CONTRIBUTING.md` - Contribution guidelines
  - [ ] `docs/PRD.md` - Product requirements
  - [ ] `docs/development-plan.md` - Development phases
  - [ ] `docs/WBS.md` - Work breakdown structure
  - [ ] `docs/database.md` - Database schema and migrations
  - [ ] `docs/hook-setup.md` - Claude Code hook configuration
  - [ ] `docs/test-harness.md` - Testing infrastructure
  - [ ] `docs/api-reference.md` - API endpoints and schemas
  - [ ] `docs/runbook.md` - Operational procedures
  - [ ] `docs/smoke-tests.md` - Post-deployment validation
  - [ ] `docs/logging.md` - Logging and monitoring

- [ ] **No broken links in documentation**
  - Check: All internal references resolve correctly
  - Check: External links are accessible

- [ ] **Code examples tested**
  - Verify: curl commands in docs work
  - Verify: Code snippets are syntactically correct

- [ ] **Changelog updated** (if applicable)
  - File: `CHANGELOG.md`
  - Include: Breaking changes, new features, bug fixes

### 4. Deployment Testing

- [ ] **Deployment script tested**
  ```bash
  scripts/deploy.sh
  ```
  - Expected: Migrations run successfully
  - Expected: Build completes without errors
  - Note: May want to use `pnpm test tests/unit` instead of full test suite

- [ ] **Smoke tests pass**
  - Follow: `docs/smoke-tests.md` checklist
  - Tests:
    - [ ] Health check (GET /health)
    - [ ] Create workflow (POST /hooks/user-prompt-submit)
    - [ ] Submit agent result (POST /api/workflows/:id/results)
    - [ ] Query status (GET /api/workflows/:id/status)
    - [ ] Manual transition (POST /api/workflows/:id/transition)
    - [ ] Error handling (400, 401, 404)

- [ ] **Database migrations validated**
  ```bash
  pnpm prisma migrate deploy
  ```
  - Expected: All migrations apply cleanly
  - Expected: Schema matches `prisma/schema.prisma`

- [ ] **PM2 configuration validated** (if using)
  ```bash
  node -c ecosystem.config.js
  ```
  - Expected: Valid JavaScript syntax
  - Expected: All required fields present

### 5. Security Review

- [ ] **No secrets in repository**
  ```bash
  git log --all --full-history --source -S "password\|secret\|key\|token" --pickaxe-all
  ```
  - Expected: No matches for hardcoded credentials
  - Check: `.env` in `.gitignore`
  - Check: `.env.example` contains placeholder values only

- [ ] **API keys validated**
  - Check: `API_KEY_ADMIN` uses strong random value (not "changeme")
  - Check: `HOOK_SECRET` uses strong random value (not "changeme")
  - Recommendation: `openssl rand -base64 32`

- [ ] **Dependencies up-to-date**
  ```bash
  pnpm outdated
  ```
  - Review: Critical security updates
  - Update: Known vulnerable packages

- [ ] **Security headers configured** (if applicable)
  - Check: CORS settings in production
  - Check: Rate limiting configured (if applicable)

### 6. Performance Validation

- [ ] **Performance tests pass**
  ```bash
  pnpm test tests/performance/latency.test.ts
  ```
  - Expected: Hook response time < 500ms
  - Expected: API response time < 1s
  - Expected: 10 parallel workflows complete without errors

- [ ] **Load testing executed** (optional)
  ```bash
  scripts/load-test.sh health
  scripts/load-test.sh hook
  scripts/load-test.sh status
  ```
  - Expected: No 500 errors
  - Expected: Average latency meets targets
  - Expected: 99th percentile acceptable

- [ ] **Database performance acceptable**
  - Check: Query times in logs
  - Expected: Recent workflow query < 50ms

### 7. Environment Configuration

- [ ] **.env.example complete**
  - Check: All required variables documented
  - Check: Comments explain each variable
  - Check: Default values provided where appropriate

- [ ] **Environment variables validated**
  - Production `.env` file created
  - All required variables set:
    - [ ] `PORT`
    - [ ] `NODE_ENV=production`
    - [ ] `DATABASE_URL`
    - [ ] `LOG_LEVEL`
    - [ ] `API_KEY_ADMIN`
    - [ ] `HOOK_SECRET`
    - [ ] `ENABLE_CC_COMPLEXITY` (optional)

### 8. PRD Requirements Verification

- [ ] **All PRD requirements implemented**
  - [ ] PRD §2: Functional Requirements
    - Workflow chains implemented (all 9 chains)
    - Complexity determination (simple/moderate/complex)
    - Agent sequencing and transitions
  - [ ] PRD §3: Hook Integration
    - UserPromptSubmit hook
    - PostToolUse hook
    - Stop hook
  - [ ] PRD §4: API Endpoints
    - GET /api/workflows/:id/status
    - POST /api/workflows/:id/set-complexity
    - POST /api/workflows/:id/results
    - POST /api/workflows/:id/transition (admin)
  - [ ] PRD §5: Error Handling
    - Invalid workflow IDs
    - Missing required fields
    - Unauthorized requests
  - [ ] PRD §8: Performance Targets
    - Hook response < 500ms
    - API response < 1s

---

## Release Execution

### 9. Git Tagging

- [ ] **Create release tag**
  ```bash
  git tag -a v[VERSION] -m "Release v[VERSION]"
  git push origin v[VERSION]
  ```

- [ ] **Verify tag pushed**
  ```bash
  git ls-remote --tags origin
  ```

### 10. Deployment

- [ ] **Deploy to staging** (if applicable)
  - Run: Deployment script on staging environment
  - Test: Smoke tests on staging
  - Verify: All functionality works as expected

- [ ] **Deploy to production**
  - Run: Deployment script on production environment
  - Monitor: Server logs for errors
  - Verify: Health check endpoint returns 200

- [ ] **Post-deployment smoke tests**
  - Run through: `docs/smoke-tests.md` checklist
  - Verify: All 6 tests pass in production

### 11. Monitoring

- [ ] **Monitor logs**
  - Check: No unexpected errors in first hour
  - Check: Workflow creation/completion logs present
  - Check: Request logging functional

- [ ] **Verify metrics** (if Prometheus integrated)
  - Check: workflow_created_total incrementing
  - Check: hook_latency_ms within targets
  - Check: No workflow_failed_total spikes

- [ ] **Database health**
  - Check: No connection errors
  - Check: Migrations applied correctly
  - Verify: `pnpm prisma studio` can connect

---

## Post-Release

### 12. Communication

- [ ] **Announce release** (if applicable)
  - Update: Internal documentation
  - Notify: Team members
  - Document: Known issues or limitations

### 13. Rollback Plan

- [ ] **Rollback procedure documented**
  - Document: Steps to revert to previous version
  - Test: Rollback procedure in staging (optional)
  - Keep: Previous version tag accessible

### 14. Retrospective

- [ ] **Document lessons learned**
  - What went well
  - What could be improved
  - Action items for next release

---

## Sign-Off

- [ ] **Release Manager**: ___________  Date: ___________
- [ ] **Technical Lead**: ___________  Date: ___________
- [ ] **QA Approval**: ___________  Date: ___________

---

**Notes**:
- This checklist should be completed for every production release
- Items can be marked N/A if not applicable to specific release
- All critical items must be completed before deployment
- Document any deviations in the Notes section below

**Release Notes**:
```
[Add any release-specific notes, known issues, or special instructions here]
```
