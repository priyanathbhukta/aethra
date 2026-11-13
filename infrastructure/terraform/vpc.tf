# ==============================================================================
# AETHRA — Multi-AZ VPC Architecture (ap-south-1 Mumbai)
# ==============================================================================

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "aethra-${var.environment}-vpc"
  }
}

# ------------------------------------------------------------------------------
# Internet Gateway & Public Subnets (ALB & NAT Gateways)
# ------------------------------------------------------------------------------
resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "aethra-${var.environment}-igw"
  }
}

resource "aws_subnet" "public" {
  count                   = 3
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "aethra-${var.environment}-public-${var.availability_zones[count.index]}"
    Tier = "Public"
  }
}

# NAT Gateways for Private Subnet Outbound Internet Access
resource "aws_eip" "nat" {
  count  = 3
  domain = "vpc"

  tags = {
    Name = "aethra-${var.environment}-nat-eip-${count.index + 1}"
  }
}

resource "aws_nat_gateway" "nat" {
  count         = 3
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = {
    Name = "aethra-${var.environment}-nat-${var.availability_zones[count.index]}"
  }

  depends_on = [aws_internet_gateway.gw]
}

# ------------------------------------------------------------------------------
# Private Application Subnets (ECS Fargate Microservices)
# ------------------------------------------------------------------------------
resource "aws_subnet" "private_app" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 4)
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name = "aethra-${var.environment}-private-app-${var.availability_zones[count.index]}"
    Tier = "PrivateApp"
  }
}

# ------------------------------------------------------------------------------
# Isolated Database Subnets (Aurora PostgreSQL & ElastiCache)
# ------------------------------------------------------------------------------
resource "aws_subnet" "database" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 8)
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name = "aethra-${var.environment}-database-${var.availability_zones[count.index]}"
    Tier = "DatabaseIsolated"
  }
}

resource "aws_db_subnet_group" "aurora" {
  name        = "aethra-${var.environment}-db-subnet-group"
  description = "Isolated subnets for multi-AZ Aurora PostgreSQL cluster"
  subnet_ids  = aws_subnet.database[*].id

  tags = {
    Name = "aethra-${var.environment}-db-subnet-group"
  }
}

# ------------------------------------------------------------------------------
# Route Tables
# ------------------------------------------------------------------------------
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.gw.id
  }

  tags = {
    Name = "aethra-${var.environment}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = 3
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private_app" {
  count  = 3
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat[count.index].id
  }

  tags = {
    Name = "aethra-${var.environment}-private-app-rt-${var.availability_zones[count.index]}"
  }
}

resource "aws_route_table_association" "private_app" {
  count          = 3
  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private_app[count.index].id
}

resource "aws_route_table" "database" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "aethra-${var.environment}-database-rt-isolated"
  }
}

resource "aws_route_table_association" "database" {
  count          = 3
  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.database.id
}
