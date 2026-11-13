# ==============================================================================
# AETHRA — AWS Cognito Multi-Tenant Identity & OIDC Provider
# ==============================================================================

resource "aws_cognito_user_pool" "pool" {
  name = "aethra-${var.environment}-user-pool"

  username_attributes      = ["email", "phone_number"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 10
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  schema {
    name                = "tenantId"
    attribute_data_type = "String"
    mutable             = true
    required            = false
  }

  schema {
    name                = "userType"
    attribute_data_type = "String"
    mutable             = true
    required            = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
    recovery_mechanism {
      name     = "verified_phone_number"
      priority = 2
    }
  }

  tags = {
    Name = "aethra-${var.environment}-cognito-pool"
  }
}

# Web App Client (with token lifetimes configured)
resource "aws_cognito_user_pool_client" "web" {
  name         = "aethra-web-client"
  user_pool_id = aws_cognito_user_pool.pool.id

  generate_secret = false

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]
}

# Mobile App Client
resource "aws_cognito_user_pool_client" "mobile" {
  name         = "aethra-mobile-client"
  user_pool_id = aws_cognito_user_pool.pool.id

  generate_secret = false

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 90

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]
}
