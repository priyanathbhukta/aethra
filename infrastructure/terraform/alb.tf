# ==============================================================================
# AETHRA — Application Load Balancer & Path-Based Ingress Routing
# ==============================================================================

resource "aws_security_group" "alb" {
  name        = "aethra-${var.environment}-alb-sg"
  description = "Controls ingress to AETHRA Application Load Balancers"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP Public"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS Public"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "aethra-${var.environment}-alb-sg"
  }
}

resource "aws_lb" "main" {
  name               = "aethra-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = var.environment == "production" ? true : false

  tags = {
    Name = "aethra-${var.environment}-alb"
  }
}

# ------------------------------------------------------------------------------
# Target Groups
# ------------------------------------------------------------------------------
resource "aws_lb_target_group" "api_gateway" {
  name        = "aethra-${var.environment}-tg-gateway"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/health/live"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  tags = {
    Name = "aethra-${var.environment}-tg-gateway"
  }
}

resource "aws_lb_target_group" "web_bff" {
  name        = "aethra-${var.environment}-tg-web-bff"
  port        = 8001
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/health/live"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  tags = {
    Name = "aethra-${var.environment}-tg-web-bff"
  }
}

resource "aws_lb_target_group" "mobile_bff" {
  name        = "aethra-${var.environment}-tg-mob-bff"
  port        = 8002
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/health/live"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  tags = {
    Name = "aethra-${var.environment}-tg-mob-bff"
  }
}

# ------------------------------------------------------------------------------
# Listeners & Path Routing
# ------------------------------------------------------------------------------
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api_gateway.arn
  }
}

# Web BFF Path Rule (/api/v1/web/*)
resource "aws_lb_listener_rule" "web_bff" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web_bff.arn
  }

  condition {
    path_pattern {
      values = ["/api/v1/web/*"]
    }
  }
}

# Mobile BFF Path Rule (/api/v1/mobile/*)
resource "aws_lb_listener_rule" "mobile_bff" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mobile_bff.arn
  }

  condition {
    path_pattern {
      values = ["/api/v1/mobile/*"]
    }
  }
}
