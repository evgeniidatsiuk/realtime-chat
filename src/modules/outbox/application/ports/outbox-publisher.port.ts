import type { OutboxEntry } from '../../domain/outbox-entry';

export const OUTBOX_PUBLISHER = Symbol('OUTBOX_PUBLISHER');

/**
 * Side-effect of an outbox row: takes the entry and delivers it to wherever
 * the topic lives (Kafka in production, an in-memory list in tests).
 */
export interface OutboxPublisher {
  publish(entry: OutboxEntry): Promise<void>;
}
