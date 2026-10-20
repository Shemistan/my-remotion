# Проверки AI Motion Studio. `check` зовётся `./check` репозитория (и pre-commit).
# Все команды — в Node из .nvmrc через scripts/with-node.sh.
NODE := ./scripts/with-node.sh

.PHONY: check lint typecheck test e2e install

check: lint typecheck test

# Чистый checkout: ставим зависимости по lockfile.
node_modules/.package-lock.json: package.json package-lock.json $(wildcard */package.json)
	$(NODE) npm ci
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
