#!/bin/sh
# browserExecutable для Remotion. Remotion запускает браузер detached — в собственной
# группе процессов, вне группы worker. Обёртка до старта Chrome пишет запись в
# `run/processes/` (тот же формат, что у fileProcessRegistry; pgid = свой pid, раз мы
# лидер группы), затем exec-ает Chrome: pid, группа и время старта сохраняются, и после
# сбоя сервера reapStale находит и убивает Chrome как обычную запись (ADR 0007).
#
# Заодно закрывает браузеру сеть: флаги прокси Remotion (`--no-proxy-server`,
# `--proxy-server='direct://'`) выкидываются, и весь не-loopback трафик идёт в
# 127.0.0.1:9 (discard, соединение отклоняется). localhost — сервер бандла Remotion —
# Chrome не проксирует.
#
# Окружение (ставит worker): MS_CHROME — настоящий chrome-headless-shell,
# MS_RUN_ROOT, MS_RUN_ID, MS_RUN_ATTEMPT — хранилище и попытка.
set -eu
: "${MS_CHROME:?}" "${MS_RUN_ROOT:?}" "${MS_RUN_ID:?}" "${MS_RUN_ATTEMPT:?}"

pid=$$
pgid=$(/bin/ps -o pgid= -p "$pid" | tr -d ' ')
# время старта — ровно как procInfo в @ms/core: ps lstart в LC_ALL=C, TZ=UTC
started=$(LC_ALL=C LANG=C TZ=UTC /bin/ps -o lstart= -p "$pid" | sed 's/^ *//; s/ *$//')
if [ -z "$pgid" ] || [ -z "$started" ]; then
  echo "chrome-wrapper: ps не дал pgid/время старта" >&2
  exit 125
fi
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

dir="$MS_RUN_ROOT/run/processes"
name="$MS_RUN_ID-a$MS_RUN_ATTEMPT-$pid.json"
# запись атомарна: tmp + mv в том же каталоге
printf '{\n  "runId": "%s",\n  "attempt": %s,\n  "pid": %s,\n  "pgid": %s,\n  "startedAt": "%s",\n  "cmd": "%s"\n}\n' \
  "$(esc "$MS_RUN_ID")" "$MS_RUN_ATTEMPT" "$pid" "$pgid" "$(esc "$started")" \
  "$(esc "chrome-headless-shell (render) $MS_CHROME")" > "$dir/.$name.tmp"
mv "$dir/.$name.tmp" "$dir/$name"

n=$#
while [ "$n" -gt 0 ]; do
  a=$1
  shift
  n=$((n - 1))
  case $a in
    --no-proxy-server | --proxy-server=* | --proxy-bypass-list=*) ;;
    *) set -- "$@" "$a" ;;
  esac
done
exec "$MS_CHROME" "$@" --proxy-server=127.0.0.1:9
