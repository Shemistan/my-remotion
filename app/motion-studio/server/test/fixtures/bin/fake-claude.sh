#!/bin/sh
# Фикстура: «claude», который сохраняет stdin, аргументы и env в cwd и печатает
# реальный ответ CLI из claude/success.json.
cat > stdin.txt
printf '%s\n' "$@" > args.txt
env > env.txt
cat "$(dirname "$0")/../claude/success.json"
