# my-remotion

## Новый компьютер

```sh
git clone <url репозитория> my-remotion && cd my-remotion
./setup        # проверки системы, затем всё нужное — в проект, тяжёлое — на SSD (≈ 10–20 мин, сеть)
./studio       # AI Motion Studio на http://127.0.0.1:8790
```

Системные требования (их `./setup` проверяет первыми и подсказывает, что сделать):

- Mac на Apple Silicon (arm64), macOS;
- Xcode Command Line Tools — `xcode-select --install` (git, python3, swiftc, make, curl);
- Claude Code CLI `claude` в PATH и вход — `claude login`;
- подключённый SSD `/Volumes/External SSD`: на нём папка материалов
  `moution-studio-materials/` (хранилище `store/`, веса моделей `models/`). Без SSD `./setup` и
  `./studio` отказываются — на системный диск не пишем;
- ≈ 2,5 ГБ на системном диске под `.deps/` и `node_modules/`, ≈ 1,6 ГБ на SSD под веса ASR.

Что куда ставится (ADR 0008):

| Где | Что |
|---|---|
| `.deps/node` | Node из `app/motion-studio/.nvmrc` (официальный tarball, sha256 по SHASUMS256) |
| `.deps/ffmpeg` | ffmpeg + ffprobe 7.1.1 (закреплённая статическая сборка, sha256 в `tools/setup/manifest.sh`) |
| `.deps/asr-venv`, `.deps/python`, `.deps/uv` | окружение воркера ASR (mlx-audio) по `app/motion-studio/tools/asr-worker/requirements.lock` |
| `app/motion-studio/node_modules` | npm-пакеты и Chrome Headless Shell для Remotion; `tools/vision-detect/bin` — детектор Apple Vision |
| SSD `moution-studio-materials/models/asr/` | веса Whisper (копия из `/Volumes/External SSD/local_models`, если там есть, иначе загрузка) |
| SSD `moution-studio-materials/store/` | хранилище приложения (`doctor --init`, если его нет; другое — `MS_DATA_DIR`) |

`./setup --check` — только проверки и список установленного, ничего не ставит. `./setup --kb` —
ещё и исходники базы знаний (`templates/…`, `official_skills/` по `knowledge/repositories.json`,
без истории); без них `./check` только предупреждает. Повторный `./setup` ничего не перекачивает.
