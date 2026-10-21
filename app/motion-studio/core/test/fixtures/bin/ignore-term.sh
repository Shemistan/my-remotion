#!/bin/bash
# Фикстура: игнорирует SIGTERM (SIG_IGN наследуют и дочерние sleep); пишет "ready" в файл $1.
trap '' TERM
echo ready > "$1"
while :; do sleep 1; done
