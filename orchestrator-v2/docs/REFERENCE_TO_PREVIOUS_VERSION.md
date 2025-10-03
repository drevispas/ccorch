# Reference to Previous Orchestrator Version

This document establishes the reference to the previous orchestrator implementation that serves as the foundation for the orchestrator-v2 refactoring.

## Previous Version Location
- **Path**: `../orchestrator`
- **Purpose**: Source reference for the complete refactoring initiative

## Key Components from Previous Version

### Core Structure
The previous orchestrator contains the following major components that will be refactored:

1. **Agents** (`../orchestrator/agents/`)
   - Agent definitions and implementations
   - Complexity-based agent selection system

2. **Core** (`../orchestrator/core/`)
   - Core orchestration logic
   - Message handling systems
   - Tool management

3. **Hooks** (`../orchestrator/hooks/`)
   - Event-based hook system
   - Integration points

4. **Server** (`../orchestrator/server/`)
   - API endpoints
   - Request handling

5. **Workflows** (`../orchestrator/workflows/`)
   - Workflow definitions
   - Process orchestration

## Migration Strategy

### Phase 1: Analysis and Planning
- Review existing codebase in `../orchestrator`
- Identify components for refactoring
- Document architectural decisions

### Phase 2: Core Implementation
- Build new core architecture
- Implement improved abstractions
- Maintain compatibility where needed

### Phase 3: Migration
- Port functionality from previous version
- Update dependencies
- Implement new features

## Reference Documents
- [BIGBANG-REFACTORING-PLAN.md](../BIGBANG-REFACTORING-PLAN.md) - Complete refactoring strategy
- [REFACTORING-QUICK-REFERENCE.md](../REFACTORING-QUICK-REFERENCE.md) - Quick reference guide

## Version Comparison

| Component | Previous (`../orchestrator`) | New (`orchestrator-v2`) |
|-----------|------------------------------|-------------------------|
| Architecture | Monolithic | Modular |
| Complexity System | Multiple definitions | Unified Complexity type |
| Agent Loading | Direct | Enhanced validation |
| Logging | Varied | Standardized |
| Testing | Basic | Comprehensive |

## Important Files to Reference

When refactoring, pay special attention to these files from the previous version:
- `../orchestrator/core/agentLoader.ts` - Agent loading logic
- `../orchestrator/core/messageHandler.ts` - Message processing
- `../orchestrator/core/toolManager.ts` - Tool management
- `../orchestrator/agents/agentDefinitions.ts` - Agent configurations

## Notes
- Always check the previous implementation before making architectural decisions
- Preserve successful patterns while improving problematic areas
- Document all deviations from the original design with justifications