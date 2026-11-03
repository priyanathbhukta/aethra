// ==============================================================================
// AETHRA — Structured Pino Logger with Context Binding
// ==============================================================================

import pino from 'pino';

export interface LogContext {
  service: string;
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  [key: string]: unknown;
}

export function createStructuredLogger(serviceName: string, level: string = 'info') {
  return pino({
    level,
    base: {
      service: serviceName,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

export type StructuredLogger = ReturnType<typeof createStructuredLogger>;
