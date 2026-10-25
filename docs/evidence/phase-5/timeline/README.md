# Превью таймлайна проекта (Task 42) — e2e

Прогон 2026-10-25T21:55:02.472Z: проект-фикстура (talk-ru-cfr.mp4, 1280×720, 30 fps, вырезка 2,0–3,5 с), сцены
overlay-lower-third (прозрачная, графика в lower_third) и fullscreen-card; timeline.build → timeline.preview
(прокси + edited-audio из прокси + renderTimelineRange целиком, масштаб 0,5, CRF 23). Ролик в git не кладётся.

- tl_p1 r1: 555 кадров (18.50 с), сцены sp_001 overlay [135, +102), sp_002 fullscreen [330, +72)
- превью: h264 960×540, 555 кадров, звук aac 48000 Гц, 18.517 с; задача 28.9 с; sha256 f3e7e356725ffdc2f7f27bef606381b55b2df9d6d6f5224ac670ff0c8ab31f93
- кадр 186 (середина sp_001, overlay): `docs/evidence/phase-5/timeline/timeline-sp_001-overlay-f186.png`
- кадр 366 (середина sp_002, fullscreen): `docs/evidence/phase-5/timeline/timeline-sp_002-fullscreen-f366.png`
