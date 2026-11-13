-- ==============================================================================
-- AETHRA — Notification Service Migration
-- Version: 20261103000001
-- Database: notification_db
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128) NOT NULL,
    channel VARCHAR(32) NOT NULL, -- email, sms, whatsapp, push
    category VARCHAR(64) NOT NULL, -- project_update, quote_received, service_ticket, promotional
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notif_pref UNIQUE (user_id, channel, category)
);

CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON notification_preferences (user_id);

-- 2. Notification Templates
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_code VARCHAR(128) NOT NULL UNIQUE,
    channel VARCHAR(32) NOT NULL, -- email, sms, whatsapp, push
    subject_template TEXT,
    body_template TEXT NOT NULL,
    required_variables JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed core templates
INSERT INTO notification_templates (id, template_code, channel, subject_template, body_template, required_variables)
VALUES
    ('n1000000-0000-0000-0000-000000000001', 'quote_issued_v1', 'email', 'New Solar Quotation: {{quotationNumber}}', 'Dear {{customerName}}, your solar quotation {{quotationNumber}} of amount INR {{amount}} is ready for review.', '["quotationNumber", "customerName", "amount"]'),
    ('n1000000-0000-0000-0000-000000000002', 'quote_issued_sms', 'sms', NULL, 'AETHRA: Quotation {{quotationNumber}} is issued. Review and approve here: {{link}}', '["quotationNumber", "link"]'),
    ('n1000000-0000-0000-0000-000000000003', 'ticket_created_v1', 'whatsapp', NULL, 'AETHRA Support: Ticket {{ticketNumber}} logged for issue {{ticketType}}. Our technician will visit soon.', '["ticketNumber", "ticketType"]')
ON CONFLICT (template_code) DO NOTHING;

-- 3. Notification Deliveries
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID,
    template_id UUID NOT NULL REFERENCES notification_templates(id) ON DELETE RESTRICT,
    recipient_user_id VARCHAR(128),
    destination VARCHAR(255) NOT NULL, -- email, phone number, device token
    channel VARCHAR(32) NOT NULL, -- email, sms, whatsapp, push
    template_data JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued', -- queued, sent, delivered, failed
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deliveries_status ON notification_deliveries (status, created_at);

-- 4. Delivery Attempts (Provider audit & error tracking)
CREATE TABLE IF NOT EXISTS delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
    provider_name VARCHAR(64) NOT NULL, -- aws_ses, twilio, kaleyra, gupshup, firebase_fcm
    provider_message_id VARCHAR(255),
    status VARCHAR(32) NOT NULL, -- success, retryable_failure, terminal_failure
    error_response TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. In-App Notifications
CREATE TABLE IF NOT EXISTS in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id VARCHAR(128) NOT NULL,
    organisation_id UUID,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    link_action VARCHAR(512),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_in_app_user ON in_app_notifications (recipient_user_id, is_read);

-- 6. Transactional Outbox
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(128) NOT NULL,
    topic VARCHAR(128) NOT NULL,
    partition_key VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    correlation_id VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notif_outbox_pending ON outbox_events (status, created_at) WHERE status = 'pending';
