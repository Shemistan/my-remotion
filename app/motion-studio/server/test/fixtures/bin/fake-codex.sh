#!/bin/sh
# Фикстура: «codex exec», который сохраняет stdin и аргументы в cwd (-C — тот же каталог),
# пишет последнее сообщение в файл после `-o` и печатает JSONL-события. Режим — файл
# `codex-mode.txt` в cwd: ok (по умолчанию) | nulls | fail | badjson | version.
if [ "$1" = "--version" ]; then echo "codex-cli 0.165.0"; exit 0; fi
cat > stdin.txt
printf '%s\n' "$@" > args.txt
mode=ok
[ -f codex-mode.txt ] && mode=$(cat codex-mode.txt)
last=""
prev=""
for a in "$@"; do
  [ "$prev" = "-o" ] && last="$a"
  prev="$a"
done
echo '{"type":"thread.started","thread_id":"th-1"}'
echo '{"type":"turn.started"}'
case "$mode" in
  fail)
    echo '{"type":"error","message":"Reconnecting... 1/5"}'
    echo '{"type":"turn.failed","error":{"message":"quota exceeded"}}'
    exit 1 ;;
  badjson)
    printf 'не json' > "$last" ;;
  nulls)
    printf '{"ok":true,"note":null}' > "$last" ;;
  *)
    printf '{"ok":true}' > "$last" ;;
esac
echo '{"type":"item.completed","item":{"id":"i1","type":"agent_message","text":"{\"ok\":true}"}}'
echo '{"type":"turn.completed","usage":{"input_tokens":1200,"cached_input_tokens":800,"output_tokens":34}}'
