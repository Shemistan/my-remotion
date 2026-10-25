# Функции ./setup (S19): проверки системы и шаги установки. POSIX sh; тесты —
# app/motion-studio/server/test/setup/setup.test.ts (функции зовутся через `. lib.sh`).
# shellcheck shell=sh

ms_ok() { printf '  ✓ %s\n' "$*"; }
ms_bad() { printf '  ✗ %s\n' "$*" >&2; }
ms_info() { printf '  · %s\n' "$*"; }

# Папка материалов и её SSD — как core/src/storage/materials.ts (MS_MATERIALS_ROOT — тесты).
ms_materials_root() { printf '%s\n' "${MS_MATERIALS_ROOT:-/Volumes/External SSD/moution-studio-materials}"; }
ms_ssd_root() { dirname "$(ms_materials_root)"; }

# --- проверки системы ---

ms_check_platform() {
  p=$(uname -sm 2>/dev/null)
  if [ "$p" = "Darwin arm64" ]; then
    ms_ok "macOS arm64"
  else
    ms_bad "нужен macOS на Apple Silicon (Darwin arm64), а здесь: ${p:-неизвестно}"
    return 1
  fi
}

ms_check_clt() {
  rc=0
  if xcode-select -p >/dev/null 2>&1; then
    ms_ok "Xcode Command Line Tools: $(xcode-select -p 2>/dev/null)"
  else
    ms_bad "нет Xcode Command Line Tools — выполните: xcode-select --install"
    rc=1
  fi
  missing=""
  for t in git python3 swiftc curl unzip tar shasum make; do
    command -v "$t" >/dev/null 2>&1 || missing="$missing $t"
  done
  if [ -n "$missing" ]; then
    ms_bad "нет в PATH:$missing — их ставит xcode-select --install"
    rc=1
  elif [ $rc -eq 0 ]; then
    ms_ok "git, python3, swiftc, curl, unzip, tar, shasum, make"
  fi
  return $rc
}

ms_check_claude() {
  if ! command -v claude >/dev/null 2>&1; then
    ms_bad "нет claude в PATH — поставьте Claude Code (https://claude.com/claude-code), затем: claude login"
    return 1
  fi
  if claude auth status 2>/dev/null | grep -q '"loggedIn": *true'; then
    ms_ok "claude: вход выполнен ($(command -v claude))"
  else
    ms_bad "claude не залогинен — выполните: claude login"
    return 1
  fi
}

# SSD подключён и это отдельный том (не каталог на системном диске); MS_ALLOW_SYSTEM_DISK=1 — тесты.
ms_check_ssd() {
  ssd=$(ms_ssd_root)
  if [ ! -d "$ssd" ]; then
    ms_bad "SSD не подключён: $ssd — подключите диск (на системный диск не пишем)"
    return 1
  fi
  if [ "${MS_ALLOW_SYSTEM_DISK:-}" != "1" ] && [ "$(stat -f %d "$ssd")" = "$(stat -f %d /)" ]; then
    ms_bad "$ssd лежит на системном диске, а не на SSD — подключите диск (на системный диск не пишем)"
    return 1
  fi
  if [ ! -w "$ssd" ] && [ ! -w "$(ms_materials_root)" ]; then
    ms_bad "на SSD нельзя писать: $ssd"
    return 1
  fi
  ms_ok "SSD: $ssd (материалы: $(ms_materials_root))"
}

# --- общее ---

ms_sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }

# Скачать URL в файл и сверить sha256; готовый файл с верным sha256 не перекачивается.
ms_fetch() {
  url=$1 dest=$2 sha=$3
  if [ -f "$dest" ] && [ "$(ms_sha256 "$dest")" = "$sha" ]; then return 0; fi
  mkdir -p "$(dirname "$dest")"
  curl -fSL --retry 3 --progress-bar -o "$dest.part" "$url" || { ms_bad "не скачалось: $url"; return 1; }
  got=$(ms_sha256 "$dest.part")
  if [ "$got" != "$sha" ]; then
    rm -f "$dest.part"
    ms_bad "sha256 не совпал: $url — получено $got, ожидалось $sha"
    return 1
  fi
  mv "$dest.part" "$dest"
}

ms_node_ok() { [ -x "$1/bin/node" ] && [ "$("$1/bin/node" --version 2>/dev/null)" = "v$2" ]; }
ms_ffmpeg_ok() { [ -x "$1/ffmpeg" ] && [ -x "$1/ffprobe" ] && [ "$(cat "$1/.build" 2>/dev/null)" = "$2" ]; }
ms_stamp_ok() { [ "$(cat "$1" 2>/dev/null)" = "$2" ]; }

# Хуки включены bootstrap.sh (путь хуков — .githooks, относительный или абсолютный).
ms_hooks_ok() {
  case "$(git config core.hooksPath 2>/dev/null)" in
    .githooks | */.githooks) return 0 ;;
    *) return 1 ;;
  esac
}

ms_size() { if [ -e "$1" ]; then du -sh "$1" 2>/dev/null | cut -f1; else echo "—"; fi; }

# Шаг установки: имя, путь (для размера), команда. Печатает время и размер.
ms_step() {
  name=$1 path=$2
  shift 2
  printf '→ %s\n' "$name"
  t0=$(date +%s)
  "$@" || { ms_bad "шаг «$name» не удался"; return 1; }
  t1=$(date +%s)
  printf '  ⏱ %s: %s с, размер %s\n' "$name" "$((t1 - t0))" "$(ms_size "$path")"
}
