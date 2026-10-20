#!/bin/sh
# Фикстура: «claude», который читает промпт из stdin и не отвечает.
cat > /dev/null
exec sleep 30
