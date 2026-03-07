/**
 * Lightweight structured JSON logger for Lambda handlers.
 *
 * Outputs single-line JSON to stdout (picked up by CloudWatch Logs).
 * No external dependencies — wraps console.log.
 *
 * @module logger
 */

/**
 * Structured log entry shape output by the logger.
 */
export interface LogEntry {
  /** Log severity level */
  level: 'info' | 'warn' | 'error';
  /** Human-readable log message */
  message: string;
  /** API Gateway request ID for traceability */
  requestId: string;
  /** Lambda handler name (e.g. "CreateExpense") */
  handler: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Optional structured metadata (status codes, durations, error details) */
  metadata?: Record<string, unknown>;
}

/**
 * Logger interface returned by createLogger.
 */
export interface Logger {
  /** Log an informational message */
  info(message: string, requestId: string, metadata?: Record<string, unknown>): void;
  /** Log a warning message */
  warn(message: string, requestId: string, metadata?: Record<string, unknown>): void;
  /** Log an error message */
  error(message: string, requestId: string, metadata?: Record<string, unknown>): void;
}

/**
 * Emit a single-line JSON log entry to stdout.
 */
function emit(
  level: LogEntry['level'],
  handler: string,
  message: string,
  requestId: string,
  metadata?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    level,
    message,
    requestId,
    handler,
    timestamp: new Date().toISOString(),
  };

  if (metadata !== undefined) {
    entry.metadata = metadata;
  }

  // Single-line JSON — no pretty-printing
  console.log(JSON.stringify(entry));
}

/**
 * Create a structured logger scoped to a specific Lambda handler.
 *
 * Usage:
 * ```ts
 * const log = createLogger('CreateExpense');
 * log.info('Request started', requestId);
 * log.error('DynamoDB write failed', requestId, { errorName: err.name });
 * ```
 *
 * @param handler - The name of the Lambda handler (e.g. "CreateExpense")
 * @returns A Logger with info, warn, and error methods
 */
export function createLogger(handler: string): Logger {
  return {
    info: (message, requestId, metadata?) => emit('info', handler, message, requestId, metadata),
    warn: (message, requestId, metadata?) => emit('warn', handler, message, requestId, metadata),
    error: (message, requestId, metadata?) => emit('error', handler, message, requestId, metadata),
  };
}

/**
 * Extract the API Gateway request ID from a Lambda event.
 *
 * For API Gateway v2 (HTTP API) events, the request ID is at
 * `event.requestContext.requestId`.
 *
 * @param event - The raw Lambda event object
 * @returns The request ID string, or "unknown" if not found
 */
export function extractRequestId(event: Record<string, unknown>): string {
  const requestContext = event['requestContext'];
  if (typeof requestContext !== 'object' || requestContext === null) {
    return 'unknown';
  }
  const ctx = requestContext as Record<string, unknown>;
  const requestId = ctx['requestId'];
  if (typeof requestId !== 'string') {
    return 'unknown';
  }
  return requestId;
}
