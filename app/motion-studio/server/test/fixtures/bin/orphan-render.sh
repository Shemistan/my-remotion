#!/bin/bash
# Фикстура «рендер с сиротой» (Task 13): порождает внука в своей группе, который
# игнорирует SIGTERM (как зависший Chrome), и пишет его pid в файл $1. Сам ждёт внука.
# Внук — отдельный bash: в /bin/bash 3.2 (macOS) нет $BASHPID, а $$ подоболочки — pid родителя.
/bin/bash -c 'trap "" TERM; echo $$ > "$1.tmp" && mv "$1.tmp" "$1"; while :; do sleep 1; done' orphan-grandchild "$1" &
wait
