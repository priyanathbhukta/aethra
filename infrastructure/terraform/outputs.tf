# ==============================================================================
# AETHRA — Terraform Infrastructure Outputs
# ==============================================================================

output "vpc_id" {
  description = "ID of the multi-AZ VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "private_app_subnet_ids" {
  description = "IDs of the private application subnets"
  value       = aws_subnet.private_app[*].id
}

output "database_subnet_ids" {
  description = "IDs of the isolated database subnets"
  value       = aws_subnet.database[*].id
}

output "alb_dns_name" {
  description = "Public DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "aurora_writer_endpoint" {
  description = "Primary writer endpoint for Aurora PostgreSQL cluster"
  value       = aws_rds_cluster.aurora.endpoint
}

output "aurora_reader_endpoint" {
  description = "Read-only replica endpoint for Aurora PostgreSQL cluster"
  value       = aws_rds_cluster.aurora.reader_endpoint
}

output "msk_bootstrap_brokers_tls" {
  description = "TLS connection host:port pairs for MSK Kafka cluster"
  value       = aws_msk_cluster.kafka.bootstrap_brokers_tls
}

output "redis_primary_endpoint" {
  description = "Primary endpoint address for ElastiCache Redis cluster"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "s3_documents_bucket" {
  description = "Name of the secure S3 document vault bucket"
  value       = aws_s3_bucket.documents.bucket
}

output "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = aws_cognito_user_pool.pool.id
}

output "cognito_web_client_id" {
  description = "Client ID for the Web App in Cognito"
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_mobile_client_id" {
  description = "Client ID for the Mobile App in Cognito"
  value       = aws_cognito_user_pool_client.mobile.id
}
