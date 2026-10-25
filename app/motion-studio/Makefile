# Проверки AI Motion Studio. `check` зовётся `./check` репозитория (и pre-commit).
# Все команды — в Node из .nvmrc через scripts/with-node.sh.
NODE := ./scripts/with-node.sh
VISION_BIN := tools/vision-detect/bin/vision-detect

.PHONY: check lint typecheck test e2e e2e-footage e2e-ui acceptance acceptance-video acceptance-script web-build install

check: lint typecheck test

# Чистый checkout: ставим зависимости по lockfile.
# `npm ci` стирает node_modules/.remotion (Chrome Headless Shell) — сразу ставим его снова,
# иначе рендер упадёт уже после трат на агентов (docs/грабли.md).
node_modules/.package-lock.json: package.json package-lock.json $(wildcard */package.json)
	$(NODE) npm ci
	$(NODE) npx tsx scripts/ensure-browser.mts
	@touch $@

install: node_modules/.package-lock.json $(VISION_BIN)

# Детектор Apple Vision (Task 30, ревью m8): пересборка при изменении main.swift. Нет swiftc или
# сборка не удалась — сообщение, install не падает: анализ видеоряда работает в режиме llm_only.
$(VISION_BIN): tools/vision-detect/main.swift
	@if command -v swiftc >/dev/null 2>&1; then \
	  $(NODE) npm run --silent build:vision || echo "vision-detect не собран (сборка swiftc не удалась): анализ видеоряда — llm_only; повторить: npm run build:vision"; \
	else \
	  echo "vision-detect не собран: нет swiftc (xcode-select --install); анализ видеоряда — llm_only, doctor: vision degraded"; \
	fi

lint: install
	$(NODE) npm run --silent lint

typecheck: install
	$(NODE) npm run --silent typecheck

test: install
	$(NODE) npm run --silent test

# Интеграционные тесты с сетью, рендером и реальным SSD (`*.e2e.test.ts`).
e2e: install
	$(NODE) npm run --silent test:e2e

# Анализ видеоряда на реальном talking-head ролике (Task 30): Apple Vision и footage.analyze
# с реальным лицом. Нужны `MS_TEST_TALKING_HEAD=<путь к ролику>` (без него тесты падают с
# понятным сообщением) и согласие человека на личный материал (V4 плана); собирает vision-detect.
e2e-footage: install
	$(NODE) npm run --silent build:vision
	MS_E2E_FACE=1 $(NODE) npm run --silent test:e2e

# UI: production-сборка `web/dist` (её отдаёт `npm start`).
web-build: install
	$(NODE) npm run --silent build -w web

# Playwright UI (Task 21): настоящий сервер на tmp-хранилище (MS_ALLOW_SYSTEM_DISK=1 только
# для него), версии из рукописных фикстур с реальным рендером, без LLM. Порт 8790 должен быть
# свободен. Скриншоты — tmp/e2e-ui/<фаза>/ui/ (gitignored); обновить evidence в репозитории —
# MS_WRITE_EVIDENCE=1 make e2e-ui (пишет в docs/evidence/{phase-1,phase-2,phase-3,script-mvp}/ui/).
e2e-ui: web-build
	$(NODE) npx playwright test -c web/playwright.config.ts

# Приёмка Phase 1 (Task 22): UI → настоящий сервер на 127.0.0.1:8790, реальный claude и рендер,
# хранилище /Volumes/External SSD/moution-studio-materials/acceptance/store (создаётся `doctor --init`). Долго
# (≈ 1,5–3 ч) и платно (справочно ≈ $10–25 по подписке). Evidence — docs/evidence/phase-1/.
# Продолжить прогон: MS_ACC_REUSE=1 MS_ACC_ONLY=resilience,mvp make acceptance.
acceptance: web-build
	$(NODE) npx playwright test -c web/playwright.acceptance.config.ts

# Приёмка Phase 2–3 на реальном сыром ролике (Task 34): UI → сервер на 127.0.0.1:8790, реальные
# claude, ASR-воркер ai-platform, ffmpeg и Apple Vision; хранилище материалов acceptance/store, копия-
# отрезок IMG_0685.MOV (`scripts/pick-test-video.mjs --raw`) в acceptance/src папки материалов.
# Phase 2 ≈ 15 мин, $0,1; стресс на всём 66-минутном ролике (≈ 45 мин) — отдельно: MS_ACC_ONLY=stress
# MS_ACC_REUSE=1 make acceptance-video. Phase 3 (≈ 3 мин, $0,2): MS_ACC_ONLY=phase3-analysis,phase3-plan,phase3-recheck.
# Evidence — docs/evidence/phase-2/ и phase-3/.
acceptance-video: web-build
	$(NODE) npm run --silent build:vision
	$(NODE) npx playwright test -c web/playwright.acceptance-video.config.ts

# Приёмка сценарного MVP (S12, спека §13): UI → сервер на 127.0.0.1:8790, реальные claude и рендер,
# хранилище материалов acceptance/store, тексты tmp/script-mvp/block-{1,2,3}.txt (MS_ACC_BLOCKS — другой
# каталог). Долго (≈ 2–4 ч) и платно (справочно). Продолжить: MS_ACC_ONLY=<шаги> при
# tmp/acceptance-script/state.json; новый прогон — без state.json.
# Evidence — docs/evidence/script-mvp/checks.json и docs/evidence/script-mvp/acceptance/.
acceptance-script: web-build
	$(NODE) npx playwright test -c web/playwright.acceptance-script.config.ts
