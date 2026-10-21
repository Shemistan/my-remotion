#!/bin/bash
# Фикстура: запускает внука `sleep` в своей группе и пишет его pid в файл $1.
sleep 600 &
echo $! > "$1.tmp" && mv "$1.tmp" "$1"
wait
