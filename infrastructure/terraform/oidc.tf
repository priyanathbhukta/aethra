# ==============================================================================
# AETHRA — GitHub Actions OIDC Provider & IAM Deployer Role
# ==============================================================================

# GitHub OIDC Identity Provider (https://token.actions.githubusercontent.com)
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f8d44034c2"
  ]

  tags = {
    Name        = "aethra-github-oidc-provider"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Trust Policy for GitHub Actions
data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    effect  = "Allow"
    actions = [
      "sts:AssumeRoleWithWebIdentity",
      "sts:TagSession"
    ]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [
        "repo:${var.github_repo}:ref:refs/heads/main",
        "repo:${var.github_repo}:environment:production",
        "repo:${var.github_repo}:*"
      ]
    }
  }
}

# IAM Role assumed by GitHub Actions
resource "aws_iam_role" "github_actions_deployer" {
  name               = "aethra-github-actions-deployer"
  description        = "IAM role for AETHRA GitHub Actions CI/CD pipeline via OIDC"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json

  tags = {
    Name        = "aethra-github-actions-deployer"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Attach AdministratorAccess for complete Terraform provisioning and ECS / ECR deployments
resource "aws_iam_role_policy_attachment" "github_actions_admin" {
  role       = aws_iam_role.github_actions_deployer.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
