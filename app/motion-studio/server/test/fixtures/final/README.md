# Фикстуры проверки финала (Task 44)

Медиа в git нет: `app/motion-studio/scripts/make-media-fixtures.mjs` строит их в
`tmp/media-fixtures/` репозитория (`--force` — заново). e2e `server/test/final/*.e2e.test.ts`
зовут скрипт сами (`server/test/final/media.ts`); нужен ffmpeg с `libx264`, `aac`, `ffv1`.

| Файл | Как построен | Зачем |
|---|---|---|
| `counter-30.mp4` | `testsrc2` 640×360, 30/1, 10 с (движущийся узор: каждый кадр свой), H.264 CRF 12, `-g 30`, `yuv420p`; звук — розовый шум `anoisesrc` (seed 44), «слова» по 0,35 с через 0,7 с (`volume … enable='gte(mod(t,0.7),0.35)'`), AAC 48 кГц моно | исходник и master (CFR на `timeline_fps`); соседние кадры различимы — сдвиг кадра определяется |
| `counter-30-16k.wav` | звук `counter-30` → 16 кГц моно s16 | `source16k`: опора синхронности |
| `delayed-audio.mp4` | `counter-30`, видео копией, звук `adelay=66` (2 кадра 30 fps) | рассинхрон: `sync` ≈ 66 000 мкс |
| `louder.mp4` | `counter-30`, звук `volume=3dB` | громкость: `delta_lu ≈ 3` |
| `final-like.mp4` | `counter-30` с вырезкой исходника [3 с, 4 с) (кадры 90–119), `fps=30`, на кадрах финала 150–239 — оранжевый прямоугольник «сцены» (`drawbox`, правая часть кадра); H.264 CRF 18 `yuv420p`, AAC 192 кбит/с 48 кГц моно | «финал»: 270 кадров, `verifyFinal` → `pass` |
| `final-like-edited.wav` | тот же монтаж звука, PCM 48 кГц | `editedAudio`: громкость и каналы |
| `final-like-ref.mkv` | тот же монтаж видео: master декодирован в RGB (bt601, TV-диапазон), прямоугольник нарисован в RGB, FFV1 без потерь `bgr0` | RGB still-кадры сцены, как у Remotion (в Task 43 — `renderTimelineRange`) |
| `final-like-st.mp4`, `delayed-audio-st.mp4`, `louder-st.mp4` | те же, звук сведён в стерео как у Remotion (`pan` по −3 дБ в каждый канал, AAC 192 кбит/с 48 кГц) | финалы для `verifyFinal` (Task 43 fix 1): каналы `mono` L≈R |
| `final-like-left.mp4` | `final-like`, звук только в левом канале | каналы: `channels` в `failures` |
| `still-30.mp4` | `testsrc2` 1 fps → 30 fps, 2 с: 30 одинаковых кадров подряд | неподвижный кадр → `inconclusive` |

Слова монтажа в тестах — по вспышкам шума: `w_00000k` в `[0,7·k, 0,7·k + 0,35)` с; вырезка
[3 с, 4 с) убирает `w_000005`. Сцена `clip_s1` — кадры 150–239, якорь `w_000009` (edited 5,3 с).

PSNR (fix 1 ревью): обе стороны (RGB-кадры) одним путём переводятся в yuv420p TV-диапазона по
матрице финала, вердикт — по Y (≥ 30 дБ), U/V — мягкий порог 25 дБ. Сравнение в RGB давало ложный
провал: эталон `yuv444p` против финала `yuv420p` — 29,9 дБ на тех же пикселях (по яркости — 44 дБ).
