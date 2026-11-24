# SFC Editor — raccourcis. `make` ou `make help` liste les cibles.
SHELL := /bin/bash
PUBLIC_URL ?= http://localhost:5173

.DEFAULT_GOAL := help
.PHONY: help install dev server dev-online build test typecheck check preview stats plan check-sfcedit \
        docker-build docker-up docker-down docker-logs clean

help: ## Affiche cette aide
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Installe les dépendances (pnpm)
	pnpm install

dev: ## Éditeur seul, mode local (http://localhost:5173)
	pnpm dev

server: ## Serveur seul (API, WebSocket, SQLite) avec PUBLIC_URL
	PUBLIC_URL=$(PUBLIC_URL) pnpm --filter @grafcet/server start

dev-online: ## Tout lancer : serveur + éditeur avec comptes et co-édition
	@trap 'kill 0' INT TERM EXIT; \
	PUBLIC_URL=$(PUBLIC_URL) pnpm --filter @grafcet/server start & \
	VITE_ACCOUNTS=1 pnpm dev & \
	wait

build: ## Construit tous les paquets et l'éditeur
	pnpm build

preview: build ## Construit puis sert l'éditeur statique
	pnpm --filter ./apps/web exec vite preview

test: ## Lance tous les tests
	pnpm -r test

typecheck: ## Vérifie les types
	pnpm -r typecheck

check: typecheck test build ## Typecheck + tests + build (avant de fusionner)

stats: ## Compteurs d'usage anonymes du serveur
	pnpm --filter @grafcet/server stats

plan: ## Attribue une offre : make plan EMAIL=a@b.fr PLAN=teacher
	@test -n "$(EMAIL)" || { echo "Usage : make plan EMAIL=a@b.fr PLAN=teacher"; exit 1; }
	pnpm --filter @grafcet/server plan $(EMAIL) $(or $(PLAN),teacher)

check-sfcedit: ## Contrôle un import SFCEdit : make check-sfcedit FILE=export.xml
	@test -n "$(FILE)" || { echo "Usage : make check-sfcedit FILE=export.xml"; exit 1; }
	pnpm check:sfcedit "$(FILE)"

docker-build: ## Construit l'image Docker
	docker compose build

docker-up: ## Démarre la production (Caddy + app) en arrière-plan
	docker compose up -d

docker-down: ## Arrête la production Docker
	docker compose down

docker-logs: ## Suit les logs Docker
	docker compose logs -f

clean: ## Supprime node_modules et dist
	find . -name node_modules -prune -o -name dist -type d -prune -print0 | xargs -0 rm -rf
	find . -name node_modules -type d -prune -print0 | xargs -0 rm -rf
