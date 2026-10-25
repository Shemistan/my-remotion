#!/usr/bin/env bash
# Выполняет команду в Node из .nvmrc. S19: сначала Node проекта `<repo>/.deps/node` (его ставит
# ./setup), иначе — через `nvm exec` (запасной путь до ./setup, doctor об этом предупреждает).
# ffmpeg/ffprobe из `.deps/ffmpeg` добавляются в начало PATH (скрипты зовут их по имени).
# Корни .deps — как в core/src/deps.ts: MS_DEPS_DIR, иначе <repo>/.deps и (в worktree) .deps main checkout.
# Пример: ./scripts/with-node.sh npx vitest run
set -e
here=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$here/../.." && pwd)
version=$(cat "$here/.nvmrc")

roots=()
if [ -n "${MS_DEPS_DIR:-}" ]; then
  roots=("$MS_DEPS_DIR")
else
  roots=("$repo/.deps")
  case "$repo" in
    */.claude/worktrees/*/*) ;;
    */.claude/worktrees/*) roots+=("${repo%/.claude/worktrees/*}/.deps") ;;
  esac
fi

ffdir=""
nodedir=""
for r in "${roots[@]}"; do
  if [ -z "$ffdir" ] && [ -x "$r/ffmpeg/ffmpeg" ]; then ffdir="$r/ffmpeg"; fi
  if [ -z "$nodedir" ] && [ -x "$r/node/bin/node" ] && [ "$("$r/node/bin/node" --version 2>/dev/null)" = "v$version" ]; then
    nodedir="$r/node/bin"
  fi
done
if [ -n "$ffdir" ]; then export PATH="$ffdir:$PATH"; fi

if [ -n "$nodedir" ]; then
  export PATH="$nodedir:$PATH"
  exec "$@"
fi

NVM_DIR=${NVM_DIR:-"$HOME/.nvm"}
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "with-node: нет Node $version ни в .deps/node, ни в nvm ($NVM_DIR/nvm.sh)." >&2
  echo "  Выполни ./setup в корне репозитория (поставит Node в .deps/node)." >&2
  exit 1
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh" --no-use
if ! nvm version "$version" | grep -q "^v"; then
  echo "with-node: Node $version (из .nvmrc) нет ни в .deps/node, ни в nvm." >&2
  echo "  Выполни ./setup в корне репозитория (или: nvm install $version)." >&2
  exit 1
fi
nvm exec --silent "$version" "$@"
