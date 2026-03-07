import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../../src/lib/logger.js';
import type { Logger, LogEntry } from '../../src/lib/logger.js';

describe('createLogger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('returns an object with info, warn, and error methods', () => {
    const logger = createLogger('TestHandler');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  describe('info()', () => {
    it('outputs a JSON log line with level "info"', () => {
      const logger = createLogger('TestHandler');
      logger.info('Request started', 'req-123');

      expect(consoleSpy).toHaveBeenCalledOnce();
      const output = consoleSpy.mock.calls[0][0] as string;
      const parsed: LogEntry = JSON.parse(output) as LogEntry;

      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('Request started');
      expect(parsed.requestId).toBe('req-123');
      expect(parsed.handler).toBe('TestHandler');
      expect(typeof parsed.timestamp).toBe('string');
    });

    it('includes optional metadata when provided', () => {
      const logger = createLogger('TestHandler');
      logger.info('Request completed', 'req-456', { statusCode: 200, duration: 150 });

      const output = consoleSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output) as LogEntry;

      expect(parsed.metadata).toEqual({ statusCode: 200, duration: 150 });
    });

    it('omits metadata field when not provided', () => {
      const logger = createLogger('TestHandler');
      logger.info('Simple message', 'req-789');

      const output = consoleSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output) as LogEntry;

      expect(parsed).not.toHaveProperty('metadata');
    });
  });

  describe('warn()', () => {
    it('outputs a JSON log line with level "warn"', () => {
      const logger = createLogger('WarnHandler');
      logger.warn('Something is off', 'req-w01');

      expect(consoleSpy).toHaveBeenCalledOnce();
      const output = consoleSpy.mock.calls[0][0] as string;
      const parsed: LogEntry = JSON.parse(output) as LogEntry;

      expect(parsed.level).toBe('warn');
      expect(parsed.message).toBe('Something is off');
      expect(parsed.requestId).toBe('req-w01');
      expect(parsed.handler).toBe('WarnHandler');
    });

    it('includes metadata when provided', () => {
      const logger = createLogger('WarnHandler');
      logger.warn('Validation issue', 'req-w02', { field: 'amount' });

      const output = consoleSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output) as LogEntry;

      expect(parsed.metadata).toEqual({ field: 'amount' });
    });
  });

  describe('error()', () => {
    it('outputs a JSON log line with level "error"', () => {
      const logger = createLogger('ErrorHandler');
      logger.error('Something broke', 'req-e01');

      expect(consoleSpy).toHaveBeenCalledOnce();
      const output = consoleSpy.mock.calls[0][0] as string;
      const parsed: LogEntry = JSON.parse(output) as LogEntry;

      expect(parsed.level).toBe('error');
      expect(parsed.message).toBe('Something broke');
      expect(parsed.requestId).toBe('req-e01');
      expect(parsed.handler).toBe('ErrorHandler');
    });

    it('includes error details in metadata', () => {
      const logger = createLogger('ErrorHandler');
      logger.error('DynamoDB failure', 'req-e02', { errorName: 'ConditionalCheckFailed' });

      const output = consoleSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output) as LogEntry;

      expect(parsed.metadata).toEqual({ errorName: 'ConditionalCheckFailed' });
    });
  });

  describe('timestamp', () => {
    it('produces a valid ISO 8601 timestamp', () => {
      const logger = createLogger('TimestampHandler');
      logger.info('Check timestamp', 'req-ts01');

      const output = consoleSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output) as LogEntry;

      // Should be a valid ISO date string
      const date = new Date(parsed.timestamp);
      expect(date.toISOString()).toBe(parsed.timestamp);
    });
  });

  describe('handler name', () => {
    it('uses the handler name passed to createLogger', () => {
      const logger = createLogger('CreateExpense');
      logger.info('test', 'req-001');

      const output = consoleSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output) as LogEntry;

      expect(parsed.handler).toBe('CreateExpense');
    });

    it('different loggers use different handler names', () => {
      const loggerA = createLogger('HandlerA');
      const loggerB = createLogger('HandlerB');

      loggerA.info('from A', 'req-a');
      loggerB.info('from B', 'req-b');

      const outputA = JSON.parse(consoleSpy.mock.calls[0][0] as string) as LogEntry;
      const outputB = JSON.parse(consoleSpy.mock.calls[1][0] as string) as LogEntry;

      expect(outputA.handler).toBe('HandlerA');
      expect(outputB.handler).toBe('HandlerB');
    });
  });

  describe('output format', () => {
    it('outputs valid JSON that can be parsed', () => {
      const logger = createLogger('FormatHandler');
      logger.info('parseable check', 'req-fmt');

      const output = consoleSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('outputs a single line (no newlines in the JSON)', () => {
      const logger = createLogger('FormatHandler');
      logger.info('single line check', 'req-fmt2', { key: 'value' });

      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).not.toContain('\n');
    });
  });
});

describe('extractRequestId', () => {
  it('is exported and extracts requestId from API Gateway v2 event', async () => {
    const { extractRequestId } = await import('../../src/lib/logger.js');
    const event = {
      requestContext: {
        requestId: 'apigw-req-123',
      },
    };
    expect(extractRequestId(event as Record<string, unknown>)).toBe('apigw-req-123');
  });

  it('returns "unknown" when requestContext is missing', async () => {
    const { extractRequestId } = await import('../../src/lib/logger.js');
    expect(extractRequestId({} as Record<string, unknown>)).toBe('unknown');
  });

  it('returns "unknown" when requestId is missing from requestContext', async () => {
    const { extractRequestId } = await import('../../src/lib/logger.js');
    const event = { requestContext: {} };
    expect(extractRequestId(event as Record<string, unknown>)).toBe('unknown');
  });
});
