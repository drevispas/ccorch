# Thinking Levels Guide

This document explains the three-tier thinking level system that automatically adapts agent behavior based on task complexity.

## Overview

The orchestration system features **three thinking levels** that determine the depth of analysis and consideration agents apply to tasks:

| Level | Agent Files | Approach | Use Case |
|-------|-------------|----------|----------|
| **Light** | *-simple.md | Direct, functional solutions | Prototypes, POCs, quick implementations |
| **Standard** | *-moderate.md | Balanced best practices | Regular features, standard development |
| **Ultra** | *-complex.md | Deep production analysis | Enterprise systems, complex requirements |

## How It Works

### Automatic Detection

The system automatically detects thinking levels from task descriptions:

**Light Think Indicators:**
- "quick", "basic", "simple", "initial", "poc", "prototype"
- "draft", "rough", "minimal", "starter", "demo", "example"
- "test", "trial", "experiment", "temporary", "placeholder"

**Ultra Think Indicators:**
- "production", "enterprise", "scalable", "optimize", "optimiz", "secure"
- "distributed", "microservice", "performance", "mission-critical"
- "high-availability", "fault-tolerant", "compliance", "audit"
- "monitoring", "observability", "disaster-recovery", "backup", "redundant", "resilient"
- "encryption", "authentication", "authorization", "security"

**Ultra Think Phrases:**
- "zero downtime", "high performance", "large scale", "enterprise grade"
- "production ready", "industry standard", "best practices"
- "security hardening", "threat modeling", "load balancing"

### Automatic Detection Process

The system follows this priority order for detection:

1. **Ultra Phrases** (highest priority, 90% confidence)
   - Checks for multi-word phrases indicating production requirements

2. **Multiple Indicators** (80% confidence)
   - 2+ light indicators → Light thinking level
   - 2+ ultra indicators → Ultra thinking level

3. **Single Indicators** (60-70% confidence)
   - Single ultra indicator → Ultra thinking level
   - Single light indicator → Light thinking level

4. **Default Standard** (50% confidence)
   - No clear indicators → Standard thinking level

## Agent Behavior by Thinking Level

### Light Think (simple agent files)
**Philosophy:** Get it working quickly

**Backend Architect:**
- Direct path to working solution
- Straightforward patterns that work
- Focus on core requirements

**Java Developer:**
- Implement what works correctly
- Clean, readable code
- Basic Spring Boot patterns

**Code Reviewer:**
- Does the code work correctly?
- Basic functionality verification
- Quick correctness check

### Standard Think (moderate agent files)
**Philosophy:** Make it good and maintainable

**Backend Architect:**
- Balanced approach with best practices
- Standard patterns (MVC, Repository, Service)
- Consider maintainability and testing

**Java Developer:**
- Professional implementation with good practices
- Proper error handling and validation
- Unit tests for critical paths

**Code Reviewer:**
- Comprehensive quality review
- Best practices adherence
- Security and performance basics

### Ultra Think (complex agent files)
**Philosophy:** Make it production-perfect

**Backend Architect:**
- Enterprise-grade architecture
- Full production considerations
- Security threat modeling
- Performance engineering
- Operational excellence

**Java Developer:**
- Production-ready implementation
- Comprehensive error handling
- Security implementation (OWASP Top 10)
- Observability and monitoring
- Scalability considerations

**Code Reviewer:**
- Exhaustive production readiness review
- Security vulnerability assessment
- Performance and scalability analysis
- Compliance verification

## Usage Examples

### Light Think Examples

```bash
# Quick prototypes
Run debug-issue workflow: create a dummy user controller

# Basic implementations
Run backend-only workflow: add simple health check endpoint

# Initial testing
Run test-only workflow: basic smoke tests for login
```

**Expected Behavior:**
- Single controller files with hardcoded responses
- Minimal error handling
- Focus on functionality over optimization
- Faster execution with light agent definitions

### Standard Think Examples

```bash
# Regular features
Run backend-only workflow: implement user registration

# Standard improvements
Run review-refactor workflow: optimize database queries

# Balanced development
Run full-feature workflow: add product search functionality
```

**Expected Behavior:**
- Proper 3-layer architecture (Controller-Service-Repository)
- Standard error handling and validation
- Basic security considerations
- Balanced execution time with moderate agent definitions

### Ultra Think Examples

```bash
# Production systems
Run architecture workflow: design scalable payment processing

# Enterprise features
Run backend-only workflow: implement production-ready user authentication

# Complex requirements
Run full-feature workflow: build enterprise-grade reporting system
```

**Expected Behavior:**
- Comprehensive architecture analysis
- Full security threat modeling
- Performance and scalability planning
- Production deployment considerations
- Thorough execution with complex agent definitions

## Benefits

### Performance Improvements
- **Faster execution** for light-think tasks with simplified agent definitions
- **Reduced token usage** with appropriately-sized agent prompts
- **Optimized resource allocation** based on actual task complexity

### Quality Matching
- **Appropriate depth** for task requirements
- **No over-engineering** for simple tasks
- **Full production rigor** when needed

### User Experience
- **Automatic adaptation** - no configuration required
- **Manual override** available when needed
- **Predictable behavior** based on task description

## Technical Implementation

### File Structure

```
agents/
├── backend-architect-simple.md     # Light think definitions
├── backend-architect-moderate.md   # Standard think definitions
├── backend-architect-complex.md    # Ultra think definitions
├── java-backend-developer-simple.md
├── java-backend-developer-moderate.md
├── java-backend-developer-complex.md
├── code-reviewer-simple.md
├── code-reviewer-moderate.md
├── code-reviewer-complex.md
├── e2e-test-architect-simple.md
├── e2e-test-architect-moderate.md
├── e2e-test-architect-complex.md
├── issue-detective-simple.md
├── issue-detective-moderate.md
├── issue-detective-complex.md
├── nextjs-react-developer-simple.md
├── nextjs-react-developer-moderate.md
└── nextjs-react-developer-complex.md
```

### Detection System

The `complexity-detector.ts` module:
- Analyzes task descriptions using keyword and phrase matching
- Provides confidence scores (0.5-0.9) and reasoning
- Returns TypeScript enum: `ThinkingLevel = 'light' | 'standard' | 'ultra'`
- Includes `ComplexityAnalysis` interface with detailed results

**Key Functions:**
- `detectThinkingLevel(taskDescription)`: Returns thinking level
- `analyzeComplexity(taskDescription)`: Returns detailed analysis
- `getAgentSuffix(thinkingLevel)`: Maps to file suffixes (simple/moderate/complex)
- `getThinkingLevelDescription(thinkingLevel)`: Human-readable descriptions

### Agent Loading

The `agent-loader.ts` system:
- Loads agent files using naming pattern: `{agentName}-{suffix}.md`
- Falls back to moderate (standard) level if specific level unavailable
- Supports flat directory structure in `/agents/`
- TypeScript-based with proper error handling

## HTTP Server Integration

### Workflow Execution
- Thinking levels are automatically detected from task descriptions
- Passed through the orchestration engine via `ThinkingLevel` parameter
- Stored in workflow state for consistency across agent execution
- Accessible via HTTP API for monitoring and debugging

### API Integration
- Detection happens in server endpoints during workflow initialization
- Results logged with confidence scores for debugging
- Thinking level persisted with workflow metadata
- Available in workflow status responses

## Best Practices

### For Users
1. **Use natural language** - let the system detect complexity automatically
2. **Be specific about requirements** - "production-ready" vs "prototype" vs "quick test"
3. **Include context keywords** - use terms like "enterprise", "scalable", or "simple" to guide detection

### For Developers
1. **Review detection results** - check logs for thinking level decisions
2. **Monitor execution times** - ensure appropriate levels are selected
3. **Customize agents** - modify definitions for organization-specific needs

## Troubleshooting

### Common Issues

**"Task taking too long for simple request"**
- Add keywords like "simple", "basic", "quick", "prototype" to trigger light think
- Use multiple indicators for stronger confidence: "quick basic prototype"

**"Not enough detail in complex system"**
- Add keywords like "production", "enterprise", "scalable", "secure"
- Use phrases like "production ready" or "enterprise grade" for high confidence

**"Agent definition not found"**
- Check if all thinking levels exist for the agent
- System will fall back to standard level automatically

### Debugging

The system automatically logs thinking level decisions during workflow execution:

**Server Logs:**
- Complexity analysis results with confidence scores
- Agent file loading success/failures
- Thinking level used for each agent

**HTTP API:**
- `/api/status/{workflowId}` includes thinking level in response
- Debug endpoints provide detailed complexity analysis
- Workflow metadata persists thinking level information

## Future Enhancements

### Planned Features
- **Learning system** - improve detection based on user feedback
- **Custom thinking levels** - organization-specific complexity tiers
- **Agent specialization** - role-specific thinking adaptations
- **Performance analytics** - detailed timing and quality metrics

### Customization Options
- **Keyword customization** - modify detection indicators
- **Confidence thresholds** - adjust detection sensitivity
- **Agent templates** - create organization-specific definitions
- **Workflow integration** - thinking level routing in workflows