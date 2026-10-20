#!/usr/bin/env bash
# Выполняет команду в Node из .nvmrc через `nvm exec`.
# Пример: ./scripts/with-node.sh npx vitest run
set -e
here=$(cd "$(dirname "$0")/.." && pwd)
version=$(cat "$here/.nvmrc")
NVM_DIR=${NVM_DIR:-"$HOME/.nvm"}
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "with-node: nvm не найден ($NVM_DIR/nvm.sh)." >&2
  echo "  Установи nvm и выполни: nvm install $version" >&2
  exit 1
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh" --no-use
nvm exec --silent "$version" "$@"
