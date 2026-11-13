# ==============================================================================
# AETHRA — Production Terraform Variables
# ==============================================================================

variable "aws_region" {
  description = "AWS Region for India data residency compliance"
  type        = string
  default     = "ap-south-1" # AWS Asia Pacific (Mumbai)
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "CIDR block for the multi-AZ VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Multi-AZ availability zones in Mumbai region"
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
}

variable "domain_name" {
  description = "Apex domain name for AETHRA SaaS platform"
  type        = string
  default     = "aethra.energy"
}

variable "db_instance_class" {
  description = "RDS Aurora Serverless v2 ACU range"
  type        = string
  default     = "db.serverless"
}

variable "db_min_capacity" {
  description = "Minimum Aurora Serverless ACUs"
  type        = number
  default     = 0.5
}

variable "db_max_capacity" {
  description = "Maximum Aurora Serverless ACUs"
  type        = number
  default     = 16.0
}

variable "db_master_username" {
  description = "Master administrative username for Aurora PostgreSQL"
  type        = string
  default     = "aethra_admin"
}

variable "redis_node_type" {
  description = "AWS ElastiCache Redis node type"
  type        = string
  default     = "cache.t4g.medium"
}

variable "ecs_task_cpu" {
  description = "Fargate CPU units for backend microservices (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "ecs_task_memory" {
  description = "Fargate Memory (MB) for backend microservices"
  type        = number
  default     = 1024
}
