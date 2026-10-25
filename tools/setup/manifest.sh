# Закреплённые версии и sha256 зависимостей ./setup (S19, ADR 0008). Только darwin arm64.
# Поднять версию: новый URL + sha256 (с сайта поставщика и проверкой `shasum -a 256` скачанного).
# shellcheck shell=sh disable=SC2034

# Node — та же версия, что app/motion-studio/.nvmrc (./setup сверяет); sha256 tarball darwin-arm64
# из SHASUMS256.txt nodejs.org (./setup сверяет и с ним).
NODE_VERSION=22.21.1
NODE_SHA256=c170d6554fba83d41d25a76cdbad85487c077e51fa73519e41ac885aa429d8af

# ffmpeg + ffprobe 7.1.1 — статическая сборка Martin Riedl (GPL: libx264 и др.; для личного
# использования, см. ADR 0008). Энкодеры libx264, aac, prores_ks; фильтры silencedetect, scdet.
FFMPEG_VERSION=7.1.1
FFMPEG_BUILD=1741000090_7.1.1
FFMPEG_BASE=https://ffmpeg.martin-riedl.de/download/macos/arm64/$FFMPEG_BUILD
FFMPEG_ZIP_SHA256=e18c39a330ad783c33d6d7b47784e82a42f8acdbb497a1f73550f1bc0e830d44
FFPROBE_ZIP_SHA256=4eeb4644703bed221eec72107fbe2cc1e1180a3605c53136866cf43886d0499a

# uv (Astral) — ставит Python 3.12 (python-build-standalone) и окружение ASR по lock-файлу.
UV_VERSION=0.12.17
UV_URL=https://github.com/astral-sh/uv/releases/download/$UV_VERSION/uv-aarch64-apple-darwin.tar.gz
UV_SHA256=85f00cbdc6dd3e97eba4c31b4d014375a9fdfe8f570023b84e5102fc3456896b
ASR_PYTHON=3.12

# Веса ASR по умолчанию (asr.model) — те же репозитории и ревизии, что у ai-platform
# (aiplatform/montage/asr.py, CATALOG): веса MLX + файлы WhisperProcessor из openai/*.
ASR_MODEL=whisper-large-v3-turbo
ASR_WEIGHTS_REPO=mlx-community/whisper-large-v3-turbo
ASR_WEIGHTS_REV=a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb
ASR_PROCESSOR_REPO=openai/whisper-large-v3-turbo
ASR_PROCESSOR_REV=41f01f3fe87f28c78e2fbf8b568835947dd65ed9
ASR_PROCESSOR_FILES="added_tokens.json generation_config.json merges.txt normalizer.json preprocessor_config.json special_tokens_map.json tokenizer.json tokenizer_config.json vocab.json"
# Папка ai-platform с уже скачанными весами (только чтение): есть — копия, а не загрузка.
AIP_MODELS_DIR_RO="/Volumes/External SSD/local_models"
