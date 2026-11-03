#!/bin/bash
set -e

# ==============================================================================
# AETHRA — Kafka Topic Initialization Script
# ==============================================================================

echo "Waiting for Redpanda broker to be available..."
until rpk cluster info --brokers localhost:9092 > /dev/null 2>&1; do
  sleep 2
done

TOPICS=(
  "identity.user.registered.v1:3"
  "identity.user.authenticated.v1:3"
  "organisation.created.v1:3"
  "organisation.membership.created.v1:3"
  "organisation.membership.revoked.v1:3"
  "access_control.policy.updated.v1:6"
  "access_control.policy.invalidated.v1:6"
  "subscription.activated.v1:3"
  "subscription.suspended.v1:3"
  "customer.created.v1:3"
  "vendor_relationship.created.v1:3"
  "vendor_relationship.activated.v1:3"
  "vendor_relationship.revoked.v1:6"
  "crm.lead.converted.v1:3"
  "catalogue.price.updated.v1:3"
  "quotation.issued.v1:3"
  "quotation.accepted.v1:6"
  "quotation.accepted.v1.dlq:1"
  "engineering.estimate.completed.v1:3"
  "inventory.stock.received.v1:6"
  "inventory.stock.reserved.v1:6"
  "inventory.stock.issued.v1:6"
  "procurement.goods_receipt.confirmed.v1:3"
  "project.created.v1:3"
  "project.milestone.published.v1:3"
  "project.handover.completed.v1:3"
  "service.ticket.created.v1:3"
  "document.upload.completed.v1:3"
  "audit.events.v1:12"
)

echo "Creating standard Kafka topics..."
for topic_config in "${TOPICS[@]}"; do
  IFS=':' read -r topic partitions <<< "$topic_config"
  rpk topic create "$topic" -p "$partitions" --brokers localhost:9092 || true
done

echo "All AETHRA Kafka topics created successfully!"
