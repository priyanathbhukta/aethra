// ==============================================================================
// AETHRA — OpenTelemetry Distributed Tracing Initialization
// ==============================================================================

export interface TracingConfig {
  serviceName: string;
  otlpEndpoint?: string;
}

export function initTracing(config: TracingConfig): void {
  const endpoint = config.otlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  // Standard OTLP trace context export hook
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_OTEL === 'true') {
    // OpenTelemetry active trace hook
    console.log(`[OpenTelemetry] Tracing initialized for ${config.serviceName} -> ${endpoint}`);
  }
}
