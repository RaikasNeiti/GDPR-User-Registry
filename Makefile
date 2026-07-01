.PHONY: help docker-build docker-up docker-down docker-logs docker-shell \
	docker-restart docker-clean docker-test docker-status docker-backup docker-restore

DOCKER_COMPOSE ?= docker compose

# Default target
help:
	@echo "GDPR User Registry - Docker Commands"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Development:"
	@echo "  docker-build          Build Docker image"
	@echo "  docker-up             Start containers"
	@echo "  docker-down           Stop containers"
	@echo "  docker-logs           View container logs"
	@echo "  docker-shell          Access container shell"
	@echo "  docker-restart        Restart containers"
	@echo "  docker-clean          Clean up Docker resources"
	@echo ""
	@echo "Database:"
	@echo "  docker-backup         Backup PostgreSQL database"
	@echo "  docker-restore        Restore PostgreSQL database"
	@echo ""
	@echo "Testing:"
	@echo "  docker-test           Run tests in the app container"
	@echo "  docker-status         Show container status"
	@echo ""

# Development Commands
docker-build:
	@echo "Building Docker image..."
	$(DOCKER_COMPOSE) build

docker-up:
	@echo "Starting containers..."
	$(DOCKER_COMPOSE) up -d
	@echo "Containers started"
	@echo "Access at http://localhost:3000"

docker-down:
	@echo "Stopping containers..."
	$(DOCKER_COMPOSE) down
	@echo "Containers stopped"

docker-logs:
	@echo "Showing logs (Ctrl+C to exit)..."
	$(DOCKER_COMPOSE) logs -f app

docker-shell:
	@echo "Opening container shell..."
	$(DOCKER_COMPOSE) exec app sh

docker-restart:
	@echo "Restarting containers..."
	$(DOCKER_COMPOSE) restart
	@echo "Containers restarted"

docker-clean:
	@echo "Cleaning up Docker resources..."
	$(DOCKER_COMPOSE) down -v
	docker system prune -f
	@echo "Cleanup complete"

# Database Commands
docker-backup:
	@echo "Backing up PostgreSQL database..."
	@mkdir -p backups
	$(DOCKER_COMPOSE) exec -T db pg_dump -U postgres gdpr > backups/gdpr-$$(date +%Y%m%d_%H%M%S).sql
	@echo "Database backup created in ./backups/"

docker-restore:
	@echo "This will restore the database from a SQL backup"
	@echo "Available backups:"
	@ls -1 ./backups/*.sql 2>/dev/null || echo "No backups found"
	@echo "Specify backup file with: make docker-restore BACKUP=backups/gdpr-20260701_120000.sql"
ifdef BACKUP
	@echo "Restoring from $(BACKUP)..."
	$(DOCKER_COMPOSE) exec -T db psql -U postgres -d gdpr < $(BACKUP)
	@echo "Database restored"
else
	@echo "Specify backup file: make docker-restore BACKUP=backups/gdpr-20260701_120000.sql"
endif

# Status Commands
docker-status:
	@echo "Container Status:"
	$(DOCKER_COMPOSE) ps
	@echo ""
	@echo "Resource Usage:"
	docker stats --no-stream

docker-stats:
	@echo "Real-time Resource Usage (Ctrl+C to exit):"
	docker stats

# Testing
docker-test:
	@echo "Running tests..."
	$(DOCKER_COMPOSE) exec app npm test

# Utility Commands
docker-version:
	@echo "Docker version:"
	@docker --version
	@echo "Docker Compose version:"
	@docker compose version

docker-info:
	@echo "Docker System Information:"
	docker system df
