# ==============================================================================
# AETHRA — Aurora Serverless v2 Multi-Database Cluster (PostgreSQL 16)
# ==============================================================================

# Security Group for Database Access
resource "aws_security_group" "rds" {
  name        = "aethra-${var.environment}-rds-sg"
  description = "Controls access to Aurora PostgreSQL cluster"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from ECS microservice tasks"
    from_port       = 5432
    to_port         = 5432
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
    Name = "aethra-${var.environment}-rds-sg"
  }
}

# KMS Key for Database Encryption
resource "aws_kms_key" "rds" {
  description             = "KMS key for AETHRA Aurora PostgreSQL encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "aethra-${var.environment}-rds-kms"
  }
}

# Master Database Password in Secrets Manager
resource "random_password" "db_master_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "aethra/${var.environment}/aurora/credentials"
  description = "Master credentials for Aurora PostgreSQL"
  kms_key_id  = aws_kms_key.rds.arn
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_master_username
    password = random_password.db_master_password.result
    engine   = "postgres"
    port     = 5432
  })
}

# Aurora PostgreSQL Cluster
resource "aws_rds_cluster" "aurora" {
  cluster_identifier      = "aethra-${var.environment}-aurora-pg"
  engine                  = "aurora-postgresql"
  engine_version          = "16.2"
  database_name           = "postgres"
  master_username         = var.db_master_username
  master_password         = random_password.db_master_password.result
  db_subnet_group_name    = aws_db_subnet_group.aurora.name
  vpc_security_group_ids  = [aws_security_group.rds.id]
  storage_encrypted       = true
  kms_key_id              = aws_kms_key.rds.arn
  backup_retention_period = 30
  preferred_backup_window = "02:00-03:00"
  copy_tags_to_snapshot   = true
  deletion_protection     = var.environment == "production" ? true : false
  skip_final_snapshot     = var.environment == "production" ? false : true

  serverlessv2_scaling_configuration {
    min_capacity = var.db_min_capacity
    max_capacity = var.db_max_capacity
  }

  tags = {
    Name = "aethra-${var.environment}-aurora-cluster"
  }
}

# Aurora Multi-AZ Cluster Instances (Writer + Reader Failover)
resource "aws_rds_cluster_instance" "aurora_writer" {
  identifier           = "aethra-${var.environment}-aurora-writer"
  cluster_identifier   = aws_rds_cluster.aurora.id
  instance_class       = var.db_instance_class
  engine               = aws_rds_cluster.aurora.engine
  engine_version       = aws_rds_cluster.aurora.engine_version
  db_subnet_group_name = aws_db_subnet_group.aurora.name
  publicly_accessible  = false

  tags = {
    Name = "aethra-${var.environment}-aurora-writer"
  }
}

resource "aws_rds_cluster_instance" "aurora_reader" {
  identifier           = "aethra-${var.environment}-aurora-reader"
  cluster_identifier   = aws_rds_cluster.aurora.id
  instance_class       = var.db_instance_class
  engine               = aws_rds_cluster.aurora.engine
  engine_version       = aws_rds_cluster.aurora.engine_version
  db_subnet_group_name = aws_db_subnet_group.aurora.name
  publicly_accessible  = false

  tags = {
    Name = "aethra-${var.environment}-aurora-reader"
  }
}
