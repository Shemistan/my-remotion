# Проверки AI Motion Studio. `check` зовётся `./check` репозитория (и pre-commit).
# Все команды — в Node из .nvmrc через scripts/with-node.sh.
NODE := ./scripts/with-node.sh

.PHONY: check lint typecheck test e2e e2e-ui acceptance web-build install

check: lint typecheck test

# Чистый checkout: ставим зависимости по lockfile.
# `npm ci` стирает node_modules/.remotion (Chrome Headless Shell) — сразу ставим его снова,
# иначе рендер упадёт уже после трат на агентов (docs/грабли.md).
node_modules/.package-lock.json: package.json package-lock.json $(wildcard */package.json)
	$(NODE) npm ci
	$(NODE) npx tsx scripts/ensure-browser.mts
	@touch $@

install: node_modules/.package-lock.json

lint: install
	$(NODE) npm run --silent lint

typecheck: install
	$(NODE) npm run --silent typecheck

test: install
	$(NODE) npm run --silent test

# Интеграционные тесты с сетью, рендером и реальным SSD (`*.e2e.test.ts`).
e2e: install
	$(NODE) npm run --silent test:e2e

# UI: production-сборка `web/dist` (её отдаёт `npm start`).
web-build: install
	$(NODE) npm run --silent build -w web

# Playwright UI (Task 21): настоящий сервер на tmp-хранилище (MS_ALLOW_SYSTEM_DISK=1 только
# для него), версии из рукописных фикстур с реальным рендером, без LLM. Порт 8790 должен быть
# свободен. Скриншоты — docs/evidence/phase-1/ui/.
e2e-ui: web-build
	$(NODE) npx playwright test -c web/playwright.config.ts

# Приёмка Phase 1 (Task 22): UI → настоящий сервер на 127.0.0.1:8790, реальный claude и рендер,
# хранилище /Volumes/External SSD/MotionStudio-acceptance (создаётся `doctor --init`). Долго
# (≈ 1,5–3 ч) и платно (справочно ≈ $10–25 по подписке). Evidence — docs/evidence/phase-1/.
# Продолжить прогон: MS_ACC_REUSE=1 MS_ACC_ONLY=resilience,mvp make acceptance.
acceptance: web-build
	$(NODE) npx playwright test -c web/playwright.acceptance.config.ts
