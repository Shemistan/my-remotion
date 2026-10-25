# Команды корня репозитория. AI Motion Studio: `make run` → http://127.0.0.1:8790
# Хранилище — /Volumes/External SSD/moution-studio-materials/store (своё — MS_DATA_DIR=… make run).
.PHONY: run doctor check

# Запуск сервиса: ставит недостающие зависимости, собирает UI, стартует сервер (Ctrl+C — стоп).
run:
	./studio

# Проверка окружения и хранилища.
doctor:
	cd app/motion-studio && MS_DATA_DIR="$${MS_DATA_DIR:-/Volumes/External SSD/moution-studio-materials/store}" ./scripts/with-node.sh npm run --silent doctor

# Все проверки репозитория (то же, что pre-commit).
check:
	./check
