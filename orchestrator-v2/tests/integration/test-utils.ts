/**
 * Shared Test Utilities for Integration Tests
 *
 * Provides common setup and teardown functions for integration tests
 * to ensure consistent test environment configuration.
 */

/**
 * Sets up the integration test environment
 * Call this at the beginning of your test suite
 */
export const integrationTestSetup = () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

  // Increase timeouts for integration tests
  jest.setTimeout(10000);

  console.log('Integration test environment configured');
};

/**
 * Cleanup function to run after all tests
 * Ensures proper resource cleanup and prevents hanging tests
 */
export const cleanupAfterTests = async () => {
  // Allow some time for async operations to complete
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Clear any remaining timers
  jest.clearAllTimers();
  jest.useRealTimers();
};

/**
 * Helper to suppress console output during tests
 */
export const suppressConsoleOutput = () => {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
  };

  beforeAll(() => {
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  afterAll(() => {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
  });
};

/**
 * Helper to ensure all async operations complete
 */
export const flushPromises = () => {
  return new Promise(resolve => setImmediate(resolve));
};

/**
 * Helper to wait for a specific condition
 */
export const waitFor = async (
  condition: () => boolean,
  timeout = 5000,
  interval = 100
): Promise<void> => {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
};