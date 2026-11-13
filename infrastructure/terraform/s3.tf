# ==============================================================================
# AETHRA — S3 Document Vault & Malware Quarantine Storage
# ==============================================================================

resource "aws_kms_key" "s3" {
  description             = "KMS key for AETHRA S3 document encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "aethra-${var.environment}-s3-kms"
  }
}

# 1. Primary Documents Bucket
resource "aws_s3_bucket" "documents" {
  bucket        = "aethra-${var.environment}-documents-ap-south-1"
  force_destroy = var.environment == "production" ? false : true

  tags = {
    Name = "aethra-${var.environment}-documents"
  }
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.s3.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["https://*.${var.domain_name}", "http://localhost:3000"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# 2. Malware Quarantine Bucket
resource "aws_s3_bucket" "quarantine" {
  bucket        = "aethra-${var.environment}-quarantine-ap-south-1"
  force_destroy = var.environment == "production" ? false : true

  tags = {
    Name = "aethra-${var.environment}-quarantine"
  }
}

resource "aws_s3_bucket_public_access_block" "quarantine" {
  bucket = aws_s3_bucket.quarantine.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "quarantine" {
  bucket = aws_s3_bucket.quarantine.id

  rule {
    id     = "auto-delete-quarantined-files"
    status = "Enabled"

    expiration {
      days = 7
    }
  }
}
