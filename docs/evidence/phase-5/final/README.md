# Финал видеопроекта (Task 43) — e2e

Прогон 2026-10-26T00:47:38.410Z: проект-фикстура (talk-ru-cfr.mp4, 1280×720, 30 fps, вырезка 2,0–3,5 с), сцены
overlay-lower-third (прозрачная, графика в lower_third) и fullscreen-card; timeline.build → requestFinal 720p standard →
final.render (master + edited-audio целиком, renderTimelineRange весь ролик, BT.709, verifyFinal) → final.reproduce.
Ролик в git не кладётся.

- tl_p1 r1: 555 кадров, сцены sp_001 overlay [135, +102), sp_002 fullscreen [330, +72)
- final.render fin_01M5TTRCCWHY6EFS82HJD3JGR8: 1280×720 bt709, 555 кадров, звук aac 48000 Гц; задача 37.6 с; sha256 2239d7e86420c921d6be840f44421a64db768fe6dceac806c6220d62962d752b
- verify: pass; кадры source@31 43.88 дБ off 0, source@95 43.02 дБ off 0, scene@186 43.18 дБ, source@260 42.92 дБ off 0, source@324 43.62 дБ off 0, scene@366 41.19 дБ, source@459 43.03 дБ off 0, source@523 43.27 дБ off 0; sync ok (5 слов); громкость Δ -0.1 LU, true peak -5.9 dBTP; каналы mono ok (моно исходника продублировано в L и R); теги {"color_space":"bt709","color_primaries":"bt709","color_transfer":"bt709"}
- кадр 186 (середина sp_001, overlay): `docs/evidence/phase-5/final/final-sp_001-overlay-f186.png`
- кадр 366 (середина sp_002, fullscreen): `docs/evidence/phase-5/final/final-sp_002-fullscreen-f366.png`
- final.reproduce fin_01M5TTSJARN971YC4FGASCW77E: reproduced, PSNR кадров min 99 дБ, sha256 файла совпал; задача 38.0 с; master из кэша
