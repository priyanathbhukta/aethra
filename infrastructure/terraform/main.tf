# ==============================================================================
# AETHRA — Production Terraform Main Provider & Backend Configuration
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6.0"
    }
  }

  backend "s3" {
    bucket         = "aethra-terraform-state-prod"
    key            = "platform/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "aethra-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "AETHRA"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Platform    = "MultiTenant-Renewable-Energy-SaaS"
      Compliance  = "India-Data-Sovereignty-DPDP"
    }
  }
}
