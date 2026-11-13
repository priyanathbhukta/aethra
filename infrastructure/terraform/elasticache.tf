# ==============================================================================
# AETHRA — AWS ElastiCache Redis Cluster (Multi-AZ with Auto-Failover)
# ==============================================================================

resource "aws_security_group" "redis" {
  name        = "aethra-${var.environment}-redis-sg"
  description = "Controls access to ElastiCache Redis replication group"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis port 6379 from ECS microservices"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "aethra-${var.environment}-redis-sg"
  }
}

resource "aws_elasticache_subnet_group" "redis" {
  name        = "aethra-${var.environment}-redis-subnet-group"
  description = "Subnet group for ElastiCache Redis in isolated subnets"
  subnet_ids  = aws_subnet.database[*].id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "aethra-${var.environment}-redis"
  description                = "AETHRA Redis cluster for session cache, rate-limits & BullMQ"
  node_type                  = var.redis_node_type
  port                       = 6379
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
  automatic_failover_enabled = true
  multi_az_enabled           = true
  num_cache_clusters         = 2
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = {
    Name = "aethra-${var.environment}-redis"
  }
}
