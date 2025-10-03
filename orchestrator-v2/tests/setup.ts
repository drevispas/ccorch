import winston from 'winston';

winston.configure({
  level: 'error',
  transports: [new winston.transports.Console({ silent: true })],
});

afterAll(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();

  // Clear all Winston loggers to prevent open handles
  winston.clear();
});