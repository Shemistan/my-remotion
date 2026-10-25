# Превью таймлайна проекта (Task 42) — e2e

Прогон 2026-10-25T19:51:55.782Z: проект-фикстура (talk-ru-cfr.mp4, 1280×720, 30 fps, вырезка 2,0–3,5 с), сцены
overlay-lower-third (прозрачная, графика в lower_third) и fullscreen-card; timeline.build → timeline.preview
(прокси + edited-audio из прокси + renderTimelineRange целиком, масштаб 0,5, CRF 23). Ролик в git не кладётся.

- tl_p1 r1: 555 кадров (18.50 с), сцены sp_001 overlay [135, +102), sp_002 fullscreen [330, +72)
- превью: h264 960×540, 555 кадров, звук aac 48000 Гц, 18.517 с; задача 38.4 с; sha256 916920a3198f8ce9a00a0501f527e5d3683a03bd96d9d5acfd1bb4554e1da7d6
- кадр 186 (середина sp_001, overlay): `docs/evidence/phase-5/timeline/timeline-sp_001-overlay-f186.png`
- кадр 366 (середина sp_002, fullscreen): `docs/evidence/phase-5/timeline/timeline-sp_002-fullscreen-f366.png`
