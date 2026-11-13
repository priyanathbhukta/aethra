// ==============================================================================
// AETHRA — Event Bus, Outbox Relayer & Idempotency Framework
// ==============================================================================

import { EventEnvelope } from './envelope.js';

export interface IEventLogger {
  info(obj: any, msg?: string): void;
  error(obj: any, msg?: string): void;
  warn?(obj: any, msg?: string): void;
}

const defaultLogger: IEventLogger = {
  info: (_obj, _msg) => {},
  error: (obj, msg) => { console.error(`[event-bus] ${msg || ''}`, JSON.stringify(obj)); }
};

const logger = defaultLogger;

export type EventHandler<T = any> = (envelope: EventEnvelope<T>) => Promise<void>;

export interface IEventBus {
  publish<T>(topic: string, envelope: EventEnvelope<T>): Promise<void>;
  subscribe<T>(topic: string, handler: EventHandler<T>): void;
}

/**
 * High-performance, in-memory event bus with topic subscriptions,
 * used for distributed saga choreography, local testing, and async message passing.
 */
export class InMemoryEventBus implements IEventBus {
  private handlers = new Map<string, EventHandler[]>();

  subscribe<T>(topic: string, handler: EventHandler<T>): void {
    const list = this.handlers.get(topic) || [];
    list.push(handler);
    this.handlers.set(topic, list);
    logger.info({ topic, subscribersCount: list.length }, 'Subscribed handler to event topic');
  }

  async publish<T>(topic: string, envelope: EventEnvelope<T>): Promise<void> {
    const list = this.handlers.get(topic) || [];
    logger.info(
      { topic, eventId: envelope.eventId, eventType: envelope.eventType, subscribers: list.length },
      'Publishing event to topic subscribers'
    );

    for (const handler of list) {
      try {
        await handler(envelope);
      } catch (err: any) {
        logger.error(
          { topic, eventId: envelope.eventId, err: err.message },
          'Error executing event handler'
        );
        throw err;
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

/**
 * Shared singleton event bus instance for local service orchestration.
 */
export const globalEventBus = new InMemoryEventBus();

/**
 * Idempotent Inbox Guard
 * Tracks processed eventIds to guarantee at-least-once delivery does not cause duplicate processing.
 */
export class InMemoryInboxGuard {
  private processedEvents = new Set<string>();

  isProcessed(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  markProcessed(eventId: string): void {
    this.processedEvents.add(eventId);
  }

  clear(): void {
    this.processedEvents.clear();
  }
}

/**
 * Outbox Relayer
 * Drains pending events from service outbox_events tables and dispatches them to the event bus.
 */
export interface OutboxRow {
  id: string;
  event_type: string;
  topic: string;
  partition_key: string;
  payload: any;
  correlation_id: string;
  status: string;
  retry_count: number;
}

export class OutboxRelayer {
  constructor(
    private readonly eventBus: IEventBus = globalEventBus,
    private readonly serviceName: string = 'outbox-relayer'
  ) {}

  /**
   * Processes a batch of outbox rows, publishing each event to its designated Kafka topic,
   * and updating the row status to 'published'.
   */
  async processOutboxBatch(
    rows: OutboxRow[],
    markPublished: (id: string) => Promise<void>
  ): Promise<{ publishedCount: number; failedCount: number }> {
    let publishedCount = 0;
    let failedCount = 0;

    for (const row of rows) {
      try {
        const envelope: EventEnvelope<any> = row.payload;
        await this.eventBus.publish(row.topic, envelope);
        await markPublished(row.id);
        publishedCount++;
      } catch (err: any) {
        logger.error(
          { outboxId: row.id, topic: row.topic, err: err.message, service: this.serviceName },
          'Failed to relay outbox event'
        );
        failedCount++;
      }
    }

    return { publishedCount, failedCount };
  }
}
