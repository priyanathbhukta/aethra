# ==============================================================================
# AETHRA — Amazon Managed Streaming for Apache Kafka (MSK) Event Broker
# ==============================================================================

resource "aws_security_group" "msk" {
  name        = "aethra-${var.environment}-msk-sg"
  description = "Controls access to Amazon MSK Kafka cluster"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Kafka plaintext/TLS from ECS microservices"
    from_port       = 9092
    to_port         = 9098
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
    Name = "aethra-${var.environment}-msk-sg"
  }
}

resource "aws_kms_key" "msk" {
  description             = "KMS key for AETHRA MSK Kafka broker encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "aethra-${var.environment}-msk-kms"
  }
}

resource "aws_msk_cluster" "kafka" {
  cluster_name           = "aethra-${var.environment}-kafka"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = 3

  broker_node_group_info {
    instance_type   = "kafka.m5.large"
    client_subnets  = aws_subnet.private_app[*].id
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = 100
      }
    }
  }

  encryption_info {
    encryption_at_rest_kms_key_arn = aws_kms_key.msk.arn
    encryption_in_transit {
      client_broker = "TLS_PLAINTEXT"
      in_cluster    = true
    }
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.ecs.name
      }
    }
  }

  tags = {
    Name = "aethra-${var.environment}-msk-cluster"
  }
}
