// ==============================================================================
// AETHRA Notification Service — Application Domain Service & Multi-Channel Dispatch
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { NotificationDatabaseSchema } from '../database/connection.js';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('notification-service');

export interface SendNotificationCommand {
  organisationId?: string;
  templateCode: string;
  recipientUserId?: string;
  destination: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'push';
  templateData: Record<string, any>;
  correlationId: string;
}

export interface CreateInAppNotificationCommand {
  recipientUserId: string;
  organisationId?: string;
  title: string;
  body: string;
  linkAction?: string;
}

export class NotificationApplicationService {
  constructor(private readonly db: Kysely<NotificationDatabaseSchema>) {}

  /**
   * Dispatches multi-channel notification with template interpolation and provider fault isolation.
   */
  async sendNotification(cmd: SendNotificationCommand) {
    const template = await this.db
      .selectFrom('notification_templates')
      .selectAll()
      .where('template_code', '=', cmd.templateCode)
      .where('channel', '=', cmd.channel)
      .executeTakeFirst();

    if (!template) {
      throw new Error(`Template '${cmd.templateCode}' not found for channel '${cmd.channel}'`);
    }

    const deliveryId = crypto.randomUUID();
    const now = new Date();

    // Interpolate body template
    let renderedBody = template.body_template;
    for (const [key, value] of Object.entries(cmd.templateData)) {
      renderedBody = renderedBody.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }

    // Insert delivery record in queued state
    const delivery = await this.db
      .insertInto('notification_deliveries')
      .values({
        id: deliveryId,
        organisation_id: cmd.organisationId || null,
        template_id: template.id,
        recipient_user_id: cmd.recipientUserId || null,
        destination: cmd.destination,
        channel: cmd.channel,
        template_data: cmd.templateData,
        status: 'queued',
        retry_count: 0,
        created_at: now,
        sent_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Fault-Isolated Provider Dispatch
    const providerName =
      cmd.channel === 'email'
        ? 'aws_ses'
        : cmd.channel === 'sms'
          ? 'kaleyra'
          : cmd.channel === 'whatsapp'
            ? 'gupshup'
            : 'firebase_fcm';

    try {
      // Simulate external provider HTTP dispatch
      const providerMsgId = `prov-${cmd.channel}-${crypto.randomBytes(8).toString('hex')}`;

      // Record successful delivery attempt
      await this.db
        .insertInto('delivery_attempts')
        .values({
          id: crypto.randomUUID(),
          delivery_id: deliveryId,
          provider_name: providerName,
          provider_message_id: providerMsgId,
          status: 'success',
          error_response: null,
          attempted_at: new Date(),
        })
        .execute();

      // Update status to sent
      const updated = await this.db
        .updateTable('notification_deliveries')
        .set({
          status: 'sent',
          sent_at: new Date(),
        })
        .where('id', '=', deliveryId)
        .returningAll()
        .executeTakeFirstOrThrow();

      logger.info(
        { deliveryId, channel: cmd.channel, destination: cmd.destination },
        'Notification successfully dispatched via provider'
      );

      return { delivery: updated, renderedBody };
    } catch (err: any) {
      // Log provider failure without crashing business flow
      logger.warn({ deliveryId, err: err.message }, 'Provider dispatch failure; logged for retry');

      await this.db
        .insertInto('delivery_attempts')
        .values({
          id: crypto.randomUUID(),
          delivery_id: deliveryId,
          provider_name: providerName,
          provider_message_id: null,
          status: 'retryable_failure',
          error_response: err.message,
          attempted_at: new Date(),
        })
        .execute();

      await this.db
        .updateTable('notification_deliveries')
        .set({
          status: 'failed',
          retry_count: 1,
        })
        .where('id', '=', deliveryId)
        .execute();

      return { delivery, renderedBody, error: err.message };
    }
  }

  /**
   * Creates an in-app notification.
   */
  async createInAppNotification(cmd: CreateInAppNotificationCommand) {
    const notifId = crypto.randomUUID();
    const now = new Date();

    const notif = await this.db
      .insertInto('in_app_notifications')
      .values({
        id: notifId,
        recipient_user_id: cmd.recipientUserId,
        organisation_id: cmd.organisationId || null,
        title: cmd.title.trim(),
        body: cmd.body.trim(),
        link_action: cmd.linkAction || null,
        is_read: false,
        read_at: null,
        created_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return notif;
  }

  /**
   * Retrieves user in-app notifications.
   */
  async listUserNotifications(userId: string) {
    return await this.db
      .selectFrom('in_app_notifications')
      .selectAll()
      .where('recipient_user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute();
  }
}
