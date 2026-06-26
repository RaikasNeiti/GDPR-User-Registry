.PHONY: help docker-build docker-up docker-down docker-logs docker-shell \
	docker-restart docker-clean docker-prod docker-test docker-push \
	docker-pull docker-status docker-backup docker-restore

# Default target
help:
	@echo "GDPR User Registry - Docker Commands"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Development:"
	@echo "  docker-build          Build Docker image"
	@echo "  docker-up            Start containers (development)"
	@echo "  docker-down          Stop containers"
	@echo "  docker-logs          View container logs"
	@echo "  docker-shell         Access container shell"
	@echo "  docker-restart       Restart containers"
	@echo "  docker-clean         Clean up all Docker resources"
	@echo ""
	@echo "Production:"
	@echo "  docker-prod          Start containers (production)"
	@echo "  docker-prod-down     Stop production containers"
	@echo "  docker-prod-logs     View production logs"
	@echo ""
	@echo "Database:"
	@echo "  docker-backup        Backup database"
	@echo "  docker-restore       Restore database"
	@echo ""
	@echo "Testing & Deployment:"
	@echo "  docker-test          Run tests in container"
	@echo "  docker-push          Push image to registry"
	@echo "  docker-pull          Pull image from registry"
	@echo "  docker-status        Show container status"
	@echo ""

# Development Commands
docker-build:
	@echo "🔨 Building Docker image..."
	docker-compose build

docker-up:
	@echo "🚀 Starting containers..."
	docker-compose up -d
	@echo "✅ Containers started"
	@echo "🌐 Access at http://localhost:3000"

docker-down:
	@echo "🛑 Stopping containers..."
	docker-compose down
	@echo "✅ Containers stopped"

docker-logs:
	@echo "📋 Showing logs (Ctrl+C to exit)..."
	docker-compose logs -f app

docker-shell:
	@echo "🔌 Opening container shell..."
	docker-compose exec app sh

docker-restart:
	@echo "🔄 Restarting containers..."
	docker-compose restart
	@echo "✅ Containers restarted"

docker-clean:
	@echo "🧹 Cleaning up Docker resources..."
	docker-compose down -v
	docker system prune -f
	@echo "✅ Cleanup complete"

# Production Commands
docker-prod:
	@echo "🚀 Starting production containers..."
	docker-compose -f docker-compose.prod.yml up -d
	@echo "✅ Production containers started"
	@echo "🌐 Access at http://localhost:3000"

docker-prod-down:
	@echo "🛑 Stopping production containers..."
	docker-compose -f docker-compose.prod.yml down
	@echo "✅ Production containers stopped"

docker-prod-logs:
	@echo "📋 Showing production logs (Ctrl+C to exit)..."
	docker-compose -f docker-compose.prod.yml logs -f app

docker-prod-restart:
	@echo "🔄 Restarting production containers..."
	docker-compose -f docker-compose.prod.yml restart
	@echo "✅ Production containers restarted"

# Database Commands
docker-backup:
	@echo "💾 Backing up database..."
	@mkdir -p backups
	@docker-compose exec app cp data/users.db data/users.db.backup
	@docker cp gdpr-user-registry:/app/data/users.db ./backups/users.db.$(shell date +%Y%m%d_%H%M%S)
	@echo "✅ Database backed up to ./backups/"

docker-restore:
	@echo "⚠️  This will restore the database from backup"
	@echo "Available backups:"
	@ls -lh ./backups/users.db.* 2>/dev/null || echo "No backups found"
	@echo "Specify backup file with: make docker-restore BACKUP=backups/users.db.20260525_120000"
ifdef BACKUP
	@echo "🔄 Restoring from $(BACKUP)..."
	@docker cp $(BACKUP) gdpr-user-registry:/app/data/users.db
	@docker-compose restart app
	@echo "✅ Database restored"
else
	@echo "⚠️  Specify backup file: make docker-restore BACKUP=backups/users.db.TIMESTAMP"
endif

# Status Commands
docker-status:
	@echo "📊 Container Status:"
	@docker-compose ps
	@echo ""
	@echo "📈 Resource Usage:"
	@docker stats --no-stream

docker-stats:
	@echo "📈 Real-time Resource Usage (Ctrl+C to exit):"
	@docker stats

# Testing & Deployment
docker-test:
	@echo "🧪 Running tests..."
	docker-compose exec app npm test

docker-push:
	@echo "📤 Pushing image to registry..."
	@echo "Specify registry with: make docker-push REGISTRY=docker.io/username"
ifdef REGISTRY
	docker tag gdpr-registry:latest $(REGISTRY)/gdpr-registry:latest
	docker push $(REGISTRY)/gdpr-registry:latest
	@echo "✅ Image pushed to $(REGISTRY)"
else
	@echo "⚠️  Specify registry: make docker-push REGISTRY=docker.io/username"
endif

docker-pull:
	@echo "📥 Pulling image from registry..."
	@echo "Specify registry with: make docker-pull REGISTRY=docker.io/username"
ifdef REGISTRY
	docker pull $(REGISTRY)/gdpr-registry:latest
	@echo "✅ Image pulled from $(REGISTRY)"
else
	@echo "⚠️  Specify registry: make docker-pull REGISTRY=docker.io/username"
endif

# Utility Commands
docker-version:
	@echo "Docker version:"
	@docker --version
	@echo "Docker Compose version:"
	@docker-compose --version

docker-info:
	@echo "📊 Docker System Information:"
	@docker system df
