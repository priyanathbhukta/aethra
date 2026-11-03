// ==============================================================================
// AETHRA — Event Envelope Definition
// ==============================================================================

export interface EventTenantContext {
  organisationId: string;
  originatingUserId?: string;
  correlationId: string;
}

export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  producer: string;
  timestamp: string;
  correlationId: string;
  tenantContext: EventTenantContext;
  signature?: string;
  data: T;
}

export function createEventEnvelope<T>(
  eventType: string,
  producer: string,
  tenantContext: EventTenantContext,
  data: T,
  schemaVersion: number = 1,
): EventEnvelope<T> {
  return {
    eventId: crypto.randomUUID(),
    eventType,
    schemaVersion,
    producer,
    timestamp: new Date().toISOString(),
    correlationId: tenantContext.correlationId,
    tenantContext,
    data,
  };
}
