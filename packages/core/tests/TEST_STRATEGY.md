# Notectl Test Strategy

## Overview

This document outlines the comprehensive testing strategy for Notectl, a framework-agnostic rich text editor.

## Test Structure

```
tests/
├── setup.ts                    # Global test setup
├── fixtures/                   # Test data and mocks
│   ├── blocks.ts              # Block structure fixtures
│   ├── deltas.ts              # Delta operation fixtures
│   ├── plugins.ts             # Plugin fixtures
│   └── mocks.ts               # Mock implementations
├── unit/                      # Unit tests
│   ├── state/                 # EditorState tests
│   ├── plugins/               # PluginManager tests
│   ├── schema/                # Schema factory tests
│   └── delta/                 # Delta operations tests
├── integration/               # Integration tests
│   └── PluginIntegration.test.ts
└── e2e/                       # End-to-end tests (future)
```

## Test Coverage Goals

### Unit Tests (>95% coverage)
- **EditorState**: State management, immutability, serialization
- **PluginManager**: Registration, lifecycle, events, commands
- **Schema Factory**: Block, text node, and mark creation
- **Delta Operations**: All operation types and composition

### Integration Tests (All critical paths)
- Plugin system integration
- Multi-plugin coordination
- Event system
- Command execution
- Error handling


## Test Categories

### 1. Functional Tests
- Core editor operations (insert, delete, format)
- State transitions
- Plugin registration and lifecycle
- Command execution
- Event handling

### 2. Edge Case Tests
- Empty documents
- Boundary conditions (max length, offset limits)
- Concurrent operations
- Invalid inputs
- Missing dependencies

### 3. Error Handling Tests
- Plugin initialization failures
- Invalid operations
- Version mismatches
- Dependency violations

### 4. Performance Tests
- Large document handling (10,000+ blocks)
- Operation efficiency (<100ms for unit tests)
- Memory usage
- Plugin overhead

### 5. Accessibility Tests
- ARIA attributes
- Keyboard navigation
- Focus management
- Screen reader compatibility

## Test Utilities

### Fixtures
- `createMockBlock()` - Generate test block structures
- `createMockTextNode()` - Generate text nodes with marks
- `createMockDeltaEnvelope()` - Generate delta operations
- `createMockPlugin()` - Generate plugin instances
- `createMockEditorAPI()` - Mock editor API

### Helpers
- `nextTick()` - Wait for next event loop tick
- `waitFor()` - Poll for condition with timeout
- `createMockLocalStorage()` - Mock browser storage

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- EditorState.test.ts

# Run specific test suite
npm test -- --grep "PluginManager"
```

## Test Writing Guidelines

### 1. Descriptive Test Names
```typescript
✅ it('should register plugin successfully')
✅ it('should throw error when registering duplicate plugin')
❌ it('test1')
❌ it('works')
```

### 2. Arrange-Act-Assert Pattern
```typescript
it('should create block with attributes', () => {
  // Arrange
  const attrs = { level: 1 };

  // Act
  const block = createBlock('heading', attrs);

  // Assert
  expect(block.attrs).toEqual(attrs);
});
```

### 3. One Assertion Per Test
```typescript
✅ Each test verifies one specific behavior
❌ Don't combine multiple unrelated assertions
```

### 4. Test Independence
```typescript
✅ Each test should be runnable in isolation
✅ Use beforeEach for setup
✅ Clean up in afterEach
❌ Don't depend on test execution order
```

### 5. Mock External Dependencies
```typescript
✅ Mock editor API, DOM elements
✅ Use fixtures for test data
❌ Don't make real network calls
❌ Don't depend on file system
```

## Coverage Requirements

### Minimum Thresholds
- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%

### Target Coverage
- Core modules: >95%
- Plugins: >85%

## Continuous Integration

Tests run on:
- Pre-commit hook
- Pull request creation
- Push to main branch
- Scheduled nightly runs

## Future Enhancements

### E2E Tests
- Complete user workflows
- Multi-user collaboration
- Cross-browser testing
- Performance benchmarks

### Visual Regression Tests
- Screenshot comparison
- CSS rendering verification
- Theme consistency

### Accessibility Tests
- Automated WCAG compliance
- Screen reader testing
- Keyboard navigation verification

### Performance Benchmarks
- Operation throughput
- Memory usage profiling
- Bundle size tracking
- Load time monitoring

## Test Maintenance

### Regular Reviews
- Update fixtures with new features
- Remove obsolete tests
- Improve coverage gaps
- Optimize slow tests

### Documentation
- Keep test strategy updated
- Document complex test scenarios
- Maintain fixture documentation
- Update examples

## Resources

- [Vitest Documentation](https://vitest.dev)
- [Testing Library](https://testing-library.com)
