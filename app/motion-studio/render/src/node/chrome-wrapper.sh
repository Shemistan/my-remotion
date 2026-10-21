#!/bin/sh
# browserExecutable для Remotion. Remotion запускает браузер detached — в собственной
# группе процессов, вне группы worker. Обёртка до старта Chrome пишет запись в
# «боковой» файловый реестр `run/processes/` (тот же формат, что у fileProcessRegistry;
# pgid = свой pid, раз мы лидер группы): до SQLite сервера процесс, запущенный Remotion,
# не дотянется. Затем exec-ает Chrome: pid, группа и время старта сохраняются, и после
# сбоя сервера восстановление (reapAttempt по слиянию `job_processes` и бокового реестра
# по паре runId/attempt) находит и убивает Chrome как обычную запись (ADR 0007).
#
# Заодно закрывает браузеру сеть: флаги прокси Remotion (`--no-proxy-server`,
# `--proxy-server='direct://'`) выкидываются, и весь трафик идёт в 127.0.0.1:9 (discard,
# соединение отклоняется). Loopback тоже: `<-loopback>` снимает неявное исключение
# localhost/127.0.0.1/[::1], иначе сцена достучалась бы до локальных сервисов (Control
# API на 127.0.0.1:8790). Напрямую — только сервер бандла Remotion на порту, который
# worker выбрал и передал в MS_BUNDLE_PORT.
#
# Окружение (ставит worker): MS_CHROME — настоящий chrome-headless-shell,
# MS_RUN_ROOT, MS_RUN_ID, MS_RUN_ATTEMPT — хранилище и попытка, MS_BUNDLE_PORT — порт
# сервера бандла.
set -eu
: "${MS_CHROME:?}" "${MS_RUN_ROOT:?}" "${MS_RUN_ID:?}" "${MS_RUN_ATTEMPT:?}" "${MS_BUNDLE_PORT:?}"
case $MS_BUNDLE_PORT in
  '' | *[!0-9]*)
    echo "chrome-wrapper: MS_BUNDLE_PORT не число: $MS_BUNDLE_PORT" >&2
    exit 125
    ;;
esac

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
exec "$MS_CHROME" "$@" --proxy-server=127.0.0.1:9 "--proxy-bypass-list=<-loopback>;localhost:$MS_BUNDLE_PORT;127.0.0.1:$MS_BUNDLE_PORT"
