# Функции ./setup (S19): проверки системы и шаги установки. POSIX sh; тесты —
# app/motion-studio/server/test/setup/setup.test.ts (функции зовутся через `. lib.sh`).
# shellcheck shell=sh
# В POSIX sh нет local: переменные функций — с префиксом _ms_, чтобы не затирать переменные
# вызывающего скрипта (S19 fix: ms_check_clt затирал счётчик ошибок ./setup).

ms_ok() { printf '  ✓ %s\n' "$*"; }
ms_bad() { printf '  ✗ %s\n' "$*" >&2; }
ms_info() { printf '  · %s\n' "$*"; }

# Папка материалов и её SSD — как core/src/storage/materials.ts (MS_MATERIALS_ROOT — тесты).
ms_materials_root() { printf '%s\n' "${MS_MATERIALS_ROOT:-/Volumes/External SSD/moution-studio-materials}"; }
ms_ssd_root() { dirname "$(ms_materials_root)"; }

# --- проверки системы ---

ms_check_platform() {
  _ms_p=$(uname -sm 2>/dev/null)
  if [ "$_ms_p" = "Darwin arm64" ]; then
    ms_ok "macOS arm64"
  else
    ms_bad "нужен macOS на Apple Silicon (Darwin arm64), а здесь: ${_ms_p:-неизвестно}"
    return 1
  fi
}

ms_check_clt() {
  _ms_rc=0
  if xcode-select -p >/dev/null 2>&1; then
    ms_ok "Xcode Command Line Tools: $(xcode-select -p 2>/dev/null)"
  else
    ms_bad "нет Xcode Command Line Tools — выполните: xcode-select --install"
    _ms_rc=1
  fi
  _ms_missing=""
  for _ms_t in git python3 swiftc curl unzip tar shasum make; do
    command -v "$_ms_t" >/dev/null 2>&1 || _ms_missing="$_ms_missing $_ms_t"
  done
  if [ -n "$_ms_missing" ]; then
    ms_bad "нет в PATH:$_ms_missing — их ставит xcode-select --install"
    _ms_rc=1
  elif [ $_ms_rc -eq 0 ]; then
    ms_ok "git, python3, swiftc, curl, unzip, tar, shasum, make"
  fi
  return $_ms_rc
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
  _ms_ssd=$(ms_ssd_root)
  if [ ! -d "$_ms_ssd" ]; then
    ms_bad "SSD не подключён: $_ms_ssd — подключите диск (на системный диск не пишем)"
    return 1
  fi
  if [ "${MS_ALLOW_SYSTEM_DISK:-}" != "1" ] && [ "$(stat -f %d "$_ms_ssd")" = "$(stat -f %d /)" ]; then
    ms_bad "$_ms_ssd лежит на системном диске, а не на SSD — подключите диск (на системный диск не пишем)"
    return 1
  fi
  if [ ! -w "$_ms_ssd" ] && [ ! -w "$(ms_materials_root)" ]; then
    ms_bad "на SSD нельзя писать: $_ms_ssd"
    return 1
  fi
  ms_ok "SSD: $_ms_ssd (материалы: $(ms_materials_root))"
}

# --- общее ---

# Путь (или его ближайший существующий предок) на системном томе → отказ до записи.
# MS_ALLOW_SYSTEM_DISK=1 — тесты. Аргументы: путь, что это (для сообщения).
ms_check_not_system_disk() {
  _ms_p=$1
  while [ ! -e "$_ms_p" ] && [ "$_ms_p" != "/" ]; do _ms_p=$(dirname "$_ms_p"); done
  if [ "${MS_ALLOW_SYSTEM_DISK:-}" != "1" ] && [ "$(stat -f %d "$_ms_p")" = "$(stat -f %d /)" ]; then
    ms_bad "$2: $1 — на системном диске, а не на SSD (на системный диск не пишем); укажите каталог на SSD"
    return 1
  fi
}

# Исходники KB без истории (`./setup --kb`): repo — корень репозитория, tsv — путь<TAB>url<TAB>sha.
# Готовый клон (есть .git) пропускается; каталог без .git — отказ: клон в него не кладём и
# лежащее там не трогаем.
ms_install_kb() {
  _ms_repo=$1
  grep -v '^#' "$2" | while IFS="$(printf '\t')" read -r _ms_kp _ms_url _ms_sha; do
    [ -n "$_ms_kp" ] || continue
    _ms_dir="$_ms_repo/$_ms_kp"
    if [ -e "$_ms_dir/.git" ]; then ms_info "есть: $_ms_kp"; continue; fi
    if [ -e "$_ms_dir" ]; then
      ms_bad "$_ms_kp уже есть, но это не клон git (нет .git) — уберите или переименуйте каталог и запустите снова"
      return 1
    fi
    rm -rf "$_ms_dir.tmp" && mkdir -p "$_ms_dir.tmp" || return 1
    git -C "$_ms_dir.tmp" init -q &&
      git -C "$_ms_dir.tmp" fetch -q --depth 1 "$_ms_url" "$_ms_sha" &&
      git -C "$_ms_dir.tmp" -c advice.detachedHead=false checkout -q FETCH_HEAD ||
      { ms_bad "не склонировался $_ms_url@$_ms_sha"; rm -rf "$_ms_dir.tmp"; return 1; }
    mv "$_ms_dir.tmp" "$_ms_dir" || return 1
    ms_ok "$_ms_kp @ $(printf %.9s "$_ms_sha")"
  done
}

ms_sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }

# Скачать URL в файл и сверить sha256; готовый файл с верным sha256 не перекачивается.
ms_fetch() {
  _ms_url=$1 _ms_dest=$2 _ms_sha=$3
  if [ -f "$_ms_dest" ] && [ "$(ms_sha256 "$_ms_dest")" = "$_ms_sha" ]; then return 0; fi
  mkdir -p "$(dirname "$_ms_dest")"
  curl -fSL --retry 3 --progress-bar -o "$_ms_dest.part" "$_ms_url" || { ms_bad "не скачалось: $_ms_url"; return 1; }
  _ms_got=$(ms_sha256 "$_ms_dest.part")
  if [ "$_ms_got" != "$_ms_sha" ]; then
    rm -f "$_ms_dest.part"
    ms_bad "sha256 не совпал: $_ms_url — получено $_ms_got, ожидалось $_ms_sha"
    return 1
  fi
  mv "$_ms_dest.part" "$_ms_dest"
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
  _ms_name=$1 _ms_path=$2
  shift 2
  printf '→ %s\n' "$_ms_name"
  _ms_t0=$(date +%s)
  "$@" || { ms_bad "шаг «$_ms_name» не удался"; return 1; }
  _ms_t1=$(date +%s)
  printf '  ⏱ %s: %s с, размер %s\n' "$_ms_name" "$((_ms_t1 - _ms_t0))" "$(ms_size "$_ms_path")"
}
