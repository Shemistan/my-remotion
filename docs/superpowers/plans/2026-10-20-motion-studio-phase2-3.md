---
тип: plan
статус: в работе
обновлено: 2026-10-23
спека: 2026-10-20-motion-studio-phase2-3.md
---

# AI Video Production — Phase 2 (исходное видео) и Phase 3 (смысловой и визуальный план): план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** в том же приложении пользователь создаёт видеопроект, импортирует реальный talking-head ролик (оригинал не меняется, хранится в `MS_DATA_DIR` с sha256), получает прокси, waveform, миниатюры, реальную расшифровку ASR ai-platform с таймкодами слов, правит текст без потери таймкодов, получает и утверждает обратимый черновой монтаж (EDL, Approval A) с превью, затем — анализ видеоряда (сцены, ключевые кадры, лицо и руки, свободные зоны), смысловую разметку, StyleBible проекта и план анимационных сцен, где каждая сцена объяснена цитатой и диапазоном слов, имеет точные таймкоды в source и edited времени и не закрывает лицо без явной причины; пользователь правит и утверждает план (Approval B). Всё — задачи Job Orchestrator с гарантиями ADR 0006/0007, переживает перезапуск. Приёмка — ТЗ §13 Phase 2 и Phase 3 на реальном ролике с реальными ASR и моделями.

**Architecture:** поверх Phase 1 (`@ms/contracts`, `@ms/core`, `@ms/render`, `server`, `web`) добавляются: в `contracts` — схемы видеопроекта и чистая математика времени (`timecode.ts`, `timeline.ts`), общая для сервера и UI; в `server` — `src/media/` (ffprobe, импорт, прокси, waveform, миниатюры, `AsrAdapter`), `src/edit/` (ревизии транскрипта, EDL, детекторы чернового монтажа, превью), `src/analysis/` (footage, semantic, visual plan, StyleBible проекта), `src/approvals/`, `src/artifacts/` (иммутабельные ревизии артефактов проекта с fencing); утилита `tools/vision-detect` (Swift, Apple Vision) для лиц, рук и людей; в `web` — экран **Video Workspace** (ТЗ §11.1 п.3–4). LLM получает только id слов и выбирает; таймкоды, кадры, зоны и проверки считает код. ai-platform вызывается только подпроцессом, не меняется.

**Tech Stack:** то же, что в Phase 1 (Node 22.21.1, TS strict ESM, Vitest 5 / ESLint 10 по R5, Zod 3, Fastify 5, React + Vite + TanStack Query, Playwright, `better-sqlite3`, Claude Code CLI 2.1.x) плюс системные FFmpeg/ffprobe 7.1.1 (фильтры `silencedetect`, `scdet`, `astats` — [Ф] есть), Python из venv mlx-audio ai-platform (`~/.local/share/montage/mlx-audio-0.5.8/.venv/bin/python` — [Ф], путь из `ai-platform/.../montage/config.py:18`), веса `/Volumes/External SSD/local_models/asr/whisper-large-v3-turbo` ([Ф]), `swiftc` 6.4 из Command Line Tools ([Ф]) + фреймворк Vision, `say -v Milena` (ru_RU, [Ф]) — только для генерации тестовых фикстур.

**Spec:** `docs/superpowers/specs/2026-10-20-ai-motion-studio-design.md` → `AI_Motion_Studio_TZ.md` §4, §5 (A1–A5), §7, §11.2, §13 Phase 2–3; `docs/architecture/02` §4.2, `04` §1, `05` §1–3, §7, `07` §5, `08` R14–R15, `09` §7; ADR 0001–0007. Потребляет интерфейсы среза (`docs/superpowers/plans/2026-10-20-motion-playground-mvp.md`, Task 1–10) и остатка Phase 1 (`.superpowers/sdd/plan-drafts/phase1-rest.md`, Task 11–22) по точным именам; решения контроллера R1–R6.

## Порядок и параллельность

```text
Phase 1 (Task 1–22)
  └─▶ Task 23 ─▶ Task 24 ─┬─▶ Task 25 ─▶ Task 26 ─▶ Task 27 ─▶ Task 28 ─▶ Task 29 ─┐
                          │                                                         │
                          └─▶ Task 30 (нужен Task 25) ─────────┐                    │
                                       Task 31 (нужны 27, 28) ─┼─▶ Task 32 ─▶ Task 33 ┴─▶ Task 34
```

| Волна | Задачи | Параллельно |
|---|---|---|
| 1 | 23 | — |
| 2 | 24 | — |
| 3 | 25 | — |
| 4 | 26, 30 | да: `src/media/asr*` ↔ `src/analysis/footage*`, `tools/vision-detect` |
| 5 | 27 | — |
| 6 | 28 | — |
| 7 | 29, 31 | да: `api/routes/video*` + `web` ↔ `src/analysis/semantic*` |
| 8 | 32 | — |
| 9 | 33 | — |
| 10 | 34 | — |

Общие файлы с правками append-only: `server/src/jobs/handlers.ts`, `contracts/src/index.ts`, `web/src/i18n/ru.ts`. Параллельные задачи — только в отдельных worktree.

## Global Constraints

- Всё из Global Constraints среза и остатка Phase 1 остаётся в силе (Node 22.21.1 через `scripts/with-node.sh`, `MS_DATA_DIR` только через StorageGuard и `safeMkdir`, агенты только `claude -p --restricted …` без Bash и bypass, модели `agents.<role>.model`, Host/Origin на `127.0.0.1:8790`, `Idempotency-Key` на создающих POST, строки UI только через `t(key)`, коммиты без строк соавторства, ветки и `./finish` — контроллер, R1–R6).
- **Оригинал неизменяем.** Исходник пользователя открывается только на чтение; копия — `workspace/projects/<p>/source/<media-id>/original.<ext>` (на том же томе — APFS-клон `copyFile(…, COPYFILE_FICLONE)`, иначе копия), sha256 исходника до и после импорта и sha256 копии совпадают; файл `0444`, каталог `a-w`. Ни один выходной путь ffmpeg не может лежать в `source/` (`assertOutsideSource`). Импорт — только регулярный файл; symlink разрешается в реальный путь до проверки корней.
- **Один исходник на проект** (ТЗ §1.2: многокамерный монтаж вне MVP): повторный импорт в тот же проект → 409 `media_exists`; тот же sha256 повторно → существующий ассет (`deduplicated: true`).
- **Время:** все оси — целые микросекунды `*_us` (`source`, `edited`); кадры — только на `timeline_fps` проекта (рациональное `Fps`), `scene_local` — Phase 4. Функции — только из `@ms/contracts` (`usToFrame`, `frameToUs` среза + `timecode.ts`, `timeline.ts` Task 23); сервер и UI считают одинаково. Границы вырезок выровнены по кадрам `timeline_fps`.
- **Якоря — id слов, не секунды** (ТЗ §7.1, `05` §2). LLM никогда не выдаёт время: только `start_word_id`/`end_word_id` и дословные цитаты; код проверяет цитату (`verifyQuote`), считает µs и кадры. Не прошедшее проверку предложение отклоняется с причиной, а не «чинится».
- **Иммутабельные ревизии артефактов:** медиа-манифест, транскрипт `r<N>`, EDL `r<N>`, footage, semantic, StyleBible `r<N>`, план `r<N>` — каталоги, `chmod -R a-w` после публикации; в БД — индекс и указатели `current_revision`. Публикация из задачи — `ArtifactStore.publish` с проверкой fencing `jobs.attempt` в той же транзакции (как `SceneRepo.publish`); синхронные правки пользователя (текст, статусы вырезок, план) — новая ревизия с `base_revision` (иначе 409 `revision_conflict`) и проверкой замка ресурса (иначе 409 `resource_busy`).
- **Замки ресурсов проекта:** задачи, пишущие артефакт, берут замок `project:<id>:<resource>` в транзакции `claimNext` (`media`, `transcript`, `edl`, `footage`, `semantic`, `plan`); чтение иммутабельных ревизий (`roughcut.preview`) замок не берёт.
- **Approvals** (`05` §7): A — ревизия EDL, B — ревизия плана; `subject_hash = canonicalHash(документ ревизии)`; любое изменение субъекта или его входа (EDL для B, StyleBible для B) → `stale` с причиной; задачи `semantic.analyze` и `plan.visual` требуют валидного A (`approval_required`); утвердить A нельзя, пока есть вырезки `proposed`; утвердить B нельзя при `proposed`/`stale` сценах или blocking-проблемах. Автоматического «переутверждения» нет.
- **ASR:** только CLI-воркер ai-platform подпроцессом (`spawnTracked`, своя группа, реестр, отмена); ai-platform не меняется; контракт закреплён: коммит `0456395`, sha256 `asr_worker.py` = `59b7e03bf5a8b7f940b2607d357528e7120f5bb6bbe98efa70de4b39bdce1073` (настройка `asr.expectedWorkerSha256`); расхождение → `unavailable` с причиной `asr_contract_changed`, не тихий парсинг. Чтение коммита — `git -C <AI_PLATFORM_ROOT> rev-parse HEAD` (только чтение). `confidence` слов — `null` (воркер не отдаёт), в UI «нет данных». Семафор `heavy` = 1 на ASR; если занят порт `127.0.0.1:8780` — событие-предупреждение (R15).
- **Агенты Phase 2–3:** роли `rough_cut_editor`, `footage_analyst` (инструмент `Read`, cwd — draft с кадрами), `semantic_director`, `visual_planner`; модель по умолчанию `sonnet`; бюджет `analysis.maxCostUsd` $3 на задачу; автоисправлений по проверкам — `maxAutoFixes` (2). Все промпты содержат общий partial `evidence-contract.md`. Детекторы-код работают и без агента (`useAgent: false`) — для UI-тестов без LLM.
- **Лицо:** безопасность зон считается по детектору Apple Vision (код), а не по мнению LLM; агент может только добавить занятые области. Вывод по шоту — минимум по 3 кадрам (ТЗ §4).
- Тестовые медиа юнит/интеграционных тестов генерирует `scripts/make-media-fixtures.mjs` (ffmpeg + `say -v Milena`) в `tmp/media-fixtures/`; в git — только скрипт. Фейковые агенты и бинарники — только в юнит-тестах логики; e2e и приёмка — реальные ffmpeg, ASR-воркер, Vision, `claude`.
- Evidence — `docs/evidence/phase-2/…`, `docs/evidence/phase-3/…`; личные кадры пользователя — уменьшенные до 480 px по длинной стороне, видео в git не копируется (только sha256, ffprobe и путь в `MS_DATA_DIR`) — см. V4.

## Review Focus

1. Оригинал не меняется ни при импорте, ни при сбое посреди копирования, ни при ошибке ffmpeg: sha256 до/после, `0444`, выход ffmpeg в `source/` отклонён (Task 25, 34).
2. source↔edited: слово в оставленном куске отображается туда и обратно без потерь; вырезка снова «восстановлена» → таймлайн байт-в-байт как до вырезки; аудио превью по 5 контрольным словам смещено ≤ 1 кадра (Task 23, 27, 28, 34).
3. Агент выдумал цитату или указал слова из вырезанного куска → предложение отклонено с `quote_mismatch` / `anchor_in_cut`, а не принято с «примерным» временем (Task 31, 32).
4. Оверлей поверх лица без `face_override_reason` → blocking `face_overlap`, утвердить B нельзя (Task 32, 33, 34).
5. EDL изменён после Approval B → B `stale`, сцены, чьи слова вырезаны, — `stale(anchor_cut)`, остальные пересчитаны без перегенерации; сборка из устаревшего плана невозможна (Task 27, 32, 34).
6. Сервер убит `kill -9` во время ASR → воркер (группа процессов) убит, задача после рестарта `pending` и доходит до `completed`; живой воркер, игнорирующий SIGTERM, → `blocked(stale_process)` (ADR 0007; Task 26, 34).
7. ASR-контракт поменялся (другой sha256 воркера, слово с `s > e`) → `asr_contract_changed` / `asr_contract_violation`, транскрипт не создан (Task 26).

## Противоречия и пробелы спеки — на решение контроллера

| # | Где | Суть | Предложение по умолчанию (план исходит из него) |
|---|---|---|---|
| V1 | ТЗ §7.2 `start_ms`, `narration_segment_ids` ↔ `05` §2 (µs, якоря на слова) | пример ScenePlan в мс и по сегментам | `ScenePlanItem` хранит `edited_*_us`, `source_*_us`, кадры `timeline_fps` и `start_word_id`/`end_word_id`; `segment_ids` вычисляются для справки; мс нигде не хранятся |
| V2 | ТЗ §5 A1 «Загрузка исходного видео» ↔ браузер не даёт путь к файлу; Phase 1 API «путь клиента не принимается» (для отдачи файлов) | гигабайтные файлы через браузер неудобны; импорт по пути читает произвольный файл | два пути: `POST …/media/import { path }` — только внутри `media.importRoots` (по умолчанию `/Volumes/External SSD`, `$HOME/Movies`), только регулярный файл видео; и потоковая загрузка `PUT …/media/upload` (тело пишется сразу в draft на SSD, без буфера в памяти) |
| V3 | ТЗ §5 A3 «Применять только после подтверждения (Approval A)» | можно ли строить превью и анализ до A | превью rough cut строится до A (оно и нужно для решения); `semantic.analyze`, `plan.visual` — только при валидном A; footage анализирует source и от A не зависит |
| V4 | ТЗ §14 / `09` §7: видео «предоставляет пользователь либо разрешает локальный материал» ↔ evidence в git | реальный ролик — личные съёмки пользователя | приёмка на `/Volumes/External SSD/Youtube/FinalVideo/MyProtocol/MyProtocol-shorts_*.mov` (собственные материалы пользователя, выбор по ffprobe в Task 34 Step 1) после явного «да» человека; в git — кадры ≤ 480 px, фрагменты транскрипта, JSON, без видео |
| V5 | ТЗ §11.2 «перепроверять зависимые approvals» | при смене EDL можно авто-перенести B, если все якоря пересчитались | B всегда `stale` при новой ревизии плана; `plan.recheck` пересчитывает и подсвечивает изменённые сцены, человек переутверждает одной кнопкой; «незаметной сборки» нет |
| V6 | ТЗ §13 Phase 3 «Style Bible» ↔ Phase 1 Task 14 уже даёт `StyleBible` + `resolveStyle` | вторая система стилей не нужна | StyleBible проекта = `resolveStyle(base)` из пресетов Phase 1 + overrides от Visual Planner (часть Art Director) + правки пользователя; ревизии в `style/`; новых токенов нет |
| V7 | `04` §1 Footage Analyst «LLM, Read кадров» ↔ `07` §5 «Vision через Swift CLI [Д] либо LLM» | чем определять лицо | оба: Apple Vision (`swiftc` [Ф]) — лица/руки/люди/салиентность, это основа безопасных зон; Claude по реальным кадрам — объекты, жесты, фон, заметки; без `swiftc` — режим `llm_only` с пометкой «низкая уверенность зон» |
| V8 | Task 12 (Phase 1) `JobContext` и `claimNext` знают только `scene_locks` и семафоры `agents`/`renders` | нужны замки ресурсов проекта и семафор тяжёлых моделей (R15) | Task 24 расширяет: таблица `resource_locks`, `lockKeyFor(job)`, `JobContext.heavy: Semaphore(1)`; поведение для типов Phase 1 не меняется |
| V9 | бюджет | ТЗ/ADR задают $5 только на сцену | `analysis.maxCostUsd` = $3 на задачу Phase 2–3 (`roughcut.propose`, `footage.analyze`, `semantic.analyze`, `plan.visual`), настройка |
| V10 | ТЗ §4 Transcript Analyst «confidence» ↔ воркер без confidence | — | `confidence: null`, UI «нет данных»; уверенность есть только у предложений вырезок и сцен (код/агент), не у слов |

---

### Task 23: Контракты видеопроекта и математика таймкодов

**Files:**
- Create: `app/motion-studio/contracts/src/{timecode.ts,timeline.ts,media.ts,transcript.ts,edl.ts,approvals.ts,footage.ts,semantic.ts,plan.ts,project-style.ts,agents-video.ts,api-video.ts,canonical.ts}`
- Modify: `app/motion-studio/contracts/src/{jobs.ts,index.ts}`
- Test: `app/motion-studio/contracts/test/{timecode,timeline,media,transcript,edl,approvals,plan,agents-video,canonical}.test.ts`

**Interfaces:**
- Consumes: `Fps`, `usToFrame`, `frameToUs`, `toJsonSchema` (Task 3); `PATTERN_SLUGS`, `PatternSlug`, `JobTypeSchema`, `JobErrorSchema`, `StylePreset` (Task 11); `StyleBibleSchema` (Task 3)
- Produces (`@ms/contracts`):
  - `timecode.ts`: `STANDARD_FPS: Fps[]` (`24000/1001, 24, 25, 30000/1001, 30, 50, 60000/1001, 60`); `snapFps(avg: Fps): Fps` — ближайший стандарт в пределах 1 %, иначе сокращённая дробь; `snapUsToFrame(us: number, fps: Fps): number` = `frameToUs(Math.round(us·num/(den·1e6)), fps)`; `usToFrameCeil(us: number, fps: Fps): number`; `parseRational("30000/1001"): Fps`
  - `timeline.ts`: `TimelineClip = { idx: number; source_start_us: number; source_end_us: number; edited_start_us: number }`; `EditedTimeline = { fps: Fps; source_duration_us: number; duration_us: number; clips: TimelineClip[] }`; `buildTimeline(sourceDurationUs: number, cuts: { start_us: number; end_us: number }[], fps: Fps): EditedTimeline` — сортировка, слияние пересечений, выравнивание `snapUsToFrame`; `sourceToEdited(tl, us): { inCut: false; us: number } | { inCut: true; us: number /* edited-время точки склейки */ }`; `editedToSource(tl, us): number` (граница принадлежит следующему клипу); `mapRange(tl, r: { start_us; end_us }): { start_us; end_us } | null`; `mapWords(tl, words: Pick<TranscriptWord, "id" | "start_us" | "end_us">[]): Record<string, { state: "kept" | "clipped" | "removed"; edited_start_us?: number; edited_end_us?: number }>`; `rangeFromWords(tl, words: TranscriptWord[], startWordId: string, endWordId: string, pad: { preUs: number; postUs: number }): { edited: { start_us; end_us }; source: { start_us; end_us }; frames: { start: number; end: number } }`
  - `media.ts`: `ProbeSummarySchema = { container: string; duration_us: number; size_bytes: number; start_time_us: number; video: { codec: string; width: number; height: number; display_width: number; display_height: number; rotation: number; r_frame_rate: Fps; avg_frame_rate: Fps; pix_fmt: string; bit_depth?: number }; audio?: { codec: string; sample_rate: number; channels: number }; vfr: boolean; timeline_fps: Fps }`; `MediaAssetSchema = { id; project_id; original_name; rel_path; sha256; size_bytes; probe: ProbeSummary; status: "ready" | "failed"; import: { method: "path" | "upload"; source_path?: string; cloned: boolean }; created_at }`; `MediaManifestSchema = { schema_version: 1; asset: MediaAsset; derivatives: { kind: "proxy" | "waveform" | "thumbs" | "audio16k"; path; sha256; params: Record<string, unknown> }[] }`
  - `transcript.ts`: `TranscriptWordSchema = { id: string /* "w_000001", вставленные "w_000001.1" */; text: string; start_us: number; end_us: number; timing: "asr" | "interpolated"; confidence: null }`; `TranscriptSegmentSchema = { id: string /* "seg_0001" */; word_ids: string[]; start_us; end_us }`; `TranscriptRevisionDocSchema = { schema_version: 1; transcript_id; revision: number; parent_revision?: number; media_sha256: string; language: string; author: "asr" | "user"; asr?: { model: string; worker_sha256: string; ai_platform_commit: string; elapsed_s: number }; words: TranscriptWord[]; segments: TranscriptSegment[]; removed_word_ids: string[]; ops?: TranscriptOp[] }`; `TranscriptOpSchema = { op: "replace_text"; word_id; text } | { op: "replace_span"; start_word_id; end_word_id; text }`; `normalizeToken(s: string): string` (нижний регистр, `ё→е`, без пунктуации); `verifyQuote(words: TranscriptWord[], startWordId: string, endWordId: string, quote: string): { ok: true } | { ok: false; code: "quote_mismatch" | "unknown_word" | "order" }`
  - `edl.ts`: `CutReasonSchema = "pause" | "filler" | "repeat" | "false_start" | "bad_take" | "manual"`; `EditDecisionSchema = { id: string; reason: CutReason; origin: "detector" | "agent" | "user"; status: "proposed" | "accepted" | "rejected"; start_word_id?: string; end_word_id?: string; source_start_us: number; source_end_us: number; confidence: number /* 0..1 */; explanation: string; agent_note?: string }`; `EdlRevisionDocSchema = { schema_version: 1; edl_id; revision; parent_revision?; media_id; media_sha256; transcript_id; timeline_fps: Fps; decisions: EditDecision[]; ops?: EdlOp[] }`; `EdlOpSchema = { op: "set_status"; decision_id; status: "accepted" | "rejected" } | { op: "add_cut"; start_word_id; end_word_id } | { op: "add_cut_range"; source_start_us; source_end_us } | { op: "remove"; decision_id }`; `acceptedCuts(doc): { start_us; end_us }[]`
  - `approvals.ts`: `ApprovalKindSchema = "A" | "B" | "C" | "final"`; `ApprovalSchema = { id; project_id; kind; subject_ref: string /* "edl:<id>@r<N>" | "plan:<id>@r<N>" */; subject_hash: string; status: "valid" | "stale" | "revoked"; stale_reason?: "subject_changed" | "edl_changed" | "style_changed" | "upstream_A"; decided_at }`
  - `canonical.ts`: `canonicalJson(v: unknown): string` (ключи по алфавиту, массивы как есть); `canonicalHash(v: unknown): string` (sha256 hex)
  - `footage.ts`: `NormRect = { x; y; w; h }` (доли кадра, начало слева сверху); `FootageShotSchema = { id; source_start_us; source_end_us; keyframes: { us: number; path: string }[]; face: { union?: NormRect; detected_ratio: number; source: "vision" | "llm" }; hands: { union?: NormRect; detected_ratio: number }; occupied: NormRect[]; free_zones: { zone: Zone; rect: NormRect; free_ratio: number }[]; author_position: "left" | "center" | "right" | "absent" | "mixed"; motion: "static" | "handheld" | "moving"; objects: { label: string; rect?: NormRect; important: boolean }[]; notes: string; uncertainty: string[] }`; `FootageAnalysisSchema = { schema_version: 1; id; media_sha256; mode: "vision+llm" | "vision" | "llm_only"; shots: FootageShot[] }`
  - `semantic.ts`: `AnchorKindSchema = "thesis" | "number" | "concept" | "entity" | "contrast" | "sequence" | "cause_effect" | "emphasis"`; `SemanticTimelineSchema = { schema_version: 1; id; transcript_ref: { id; revision }; edl_ref: { id; revision }; chapters: { id; title; summary; start_word_id; end_word_id }[]; anchors: { id; kind: AnchorKind; start_word_id; end_word_id; quote: string; claim_type: "fact" | "assumption" | "opinion"; importance: 1 | 2 | 3; emphasis_word_ids: string[]; uncertainty?: string }[]; entities: { name; kind; mention_word_ids: string[] }[]; numbers: { value: number; unit?: string; start_word_id; end_word_id; quote; claim_type }[]; causal: { cause_anchor_id; effect_anchor_id }[]; disputed: { start_word_id; end_word_id; why: string }[] }`
  - `plan.ts`: `CompositionModeSchema = "overlay" | "fullscreen" | "split_screen" | "pip" | "callout" | "none"`; `ZoneSchema = "left_third" | "right_third" | "top_band" | "lower_third" | "full" | "split_left" | "split_right" | "pip_tl" | "pip_tr" | "pip_bl" | "pip_br"`; `ScenePlanItemSchema = { id: string /* "sp_001" */; status: "proposed" | "accepted" | "rejected" | "stale"; stale_reason?: "anchor_cut" | "timing_changed"; origin: "agent" | "user"; anchor_ids: string[]; start_word_id; end_word_id; edited: { start_us; end_us }; source: { start_us; end_us }; frames: { start; end }; segment_ids: string[]; purpose: string; visual_type: PatternSlug; composition_mode: Exclude<CompositionMode, "none">; zone: Zone; rect: NormRect; key_terms: { text: string; word_id: string; edited_at_us: number }[]; metaphor: string; complexity: 1 | 2 | 3; usefulness: 1..5; effort: 1..5; visual_load: 1..5; evidence: { quote: string; start_word_id; end_word_id; edited: { start_us; end_us } }[]; face_overlap: { ratio: number; override_reason?: string }; style_id: string }`; `PlanIssueSchema = { item_id?: string; code: string; severity: "blocking" | "warning"; message: string }`; `VisualPlanRevisionDocSchema = { schema_version: 1; plan_id; revision; parent_revision?; inputs: { edl: { id; revision; hash }; transcript: { id; revision }; semantic_id; footage_id; style: { id; revision; hash } }; items: ScenePlanItem[]; skipped: { anchor_ids: string[]; reason: string }[]; issues: PlanIssue[]; ops?: PlanOp[] }`; `PlanOpSchema = { op: "set_status"; item_id; status: "accepted" | "rejected" } | { op: "modify"; item_id; patch: Partial<Pick<ScenePlanItem, "composition_mode" | "zone" | "visual_type" | "purpose" | "key_terms" | "start_word_id" | "end_word_id">> & { override_reason?: string } } | { op: "add"; start_word_id; end_word_id; visual_type; composition_mode; zone; purpose }`
  - `project-style.ts`: `ProjectStyleDocSchema = { schema_version: 1; style_id; revision; base: { preset: StylePreset; palette_overrides?: Record<string, string>; font?: string; intensity: "calm" | "balanced" | "energetic"; depth: 0 | 1 | 2 | 3 }; resolved: StyleBible; rationale: string; author: "agent" | "user" }`
  - `agents-video.ts` (выход ролей; LLM не выдаёт времени): `RoughCutAgentOutputSchema = { decisions: { start_word_id; end_word_id; reason: "false_start" | "bad_take" | "filler" | "repeat"; confidence: number; explanation: string; quote: string }[]; reviews: { decision_id: string; verdict: "keep_cut" | "drop_cut"; why: string }[] }`; `FootageAgentOutputSchema = { shots: { shot_id; author_position; motion; gestures: "low" | "medium" | "high"; objects: { label; frame_us: number; rect?: NormRect; important: boolean }[]; background: string; notes: string; uncertainty: string[] }[] }`; `SemanticAgentOutputSchema` = `SemanticTimeline` без `id`, `transcript_ref`, `edl_ref`; `VisualPlannerOutputSchema = { style: { preset; palette_overrides?; font?; intensity; depth; rationale }; opportunities: { id; anchor_ids: string[]; start_word_id; end_word_id; decision: "plan" | "skip"; skip_reason?: string; purpose; visual_type: PatternSlug; composition_mode: CompositionMode; zone: Zone; key_terms: { text; word_id }[]; metaphor; complexity; usefulness; effort; visual_load; evidence: { quote; start_word_id; end_word_id }[]; face_override_reason?: string }[] }` — `superRefine`: `decision = "plan"` ⇒ `composition_mode ≠ "none"` и `evidence` не пуст
  - `jobs.ts` (modify): `JobTypeSchema` += `"media.import" | "asr.transcribe" | "roughcut.propose" | "roughcut.preview" | "footage.analyze" | "semantic.analyze" | "plan.visual" | "plan.recheck"`; `JobErrorSchema.code` += `"approval_required" | "asr_unavailable" | "asr_contract_changed" | "asr_contract_violation" | "low_space" | "media_invalid" | "media_exists" | "no_audio"`
  - `api-video.ts`: DTO Task 29/33 (`MediaDto`, `TranscriptDto`, `TranscriptRevisionBody`, `EdlDto`, `EdlRevisionBody`, `ApprovalDto`, `FootageDto`, `SemanticDto`, `PlanDto`, `PlanRevisionBody`, `ProjectStyleDto`, `ImportBody`)

- [x] **Step 1: Тесты (падают):**

```ts
const F30 = { num: 30, den: 1 }, NTSC = { num: 30000, den: 1001 };
expect(snapFps({ num: 1199, den: 40 })).toEqual(NTSC);          // 29.975
expect(snapFps({ num: 2400, den: 100 })).toEqual({ num: 24, den: 1 });
expect(snapFps({ num: 12, den: 1 })).toEqual({ num: 12, den: 1 });
expect(snapUsToFrame(1_010_000, F30)).toBe(1_000_000);
expect(snapUsToFrame(1_000_000, NTSC)).toBe(1_001_000);
expect(usToFrameCeil(4_800_000, F30)).toBe(144); expect(usToFrameCeil(4_810_000, F30)).toBe(145);
const tl = buildTimeline(10_000_000, [{ start_us: 7_000_000, end_us: 7_500_000 }, { start_us: 2_000_000, end_us: 3_500_000 }], F30);
expect(tl.clips).toEqual([
  { idx: 0, source_start_us: 0, source_end_us: 2_000_000, edited_start_us: 0 },
  { idx: 1, source_start_us: 3_500_000, source_end_us: 7_000_000, edited_start_us: 2_000_000 },
  { idx: 2, source_start_us: 7_500_000, source_end_us: 10_000_000, edited_start_us: 5_500_000 }]);
expect(tl.duration_us).toBe(8_000_000);
expect(buildTimeline(10_000_000, [{ start_us: 3_000_000, end_us: 4_000_000 }, { start_us: 3_500_000, end_us: 5_000_000 }], F30).clips[1].source_start_us).toBe(5_000_000);
expect(buildTimeline(10_000_000, [{ start_us: 1_010_000, end_us: 1_990_000 }], F30).clips[1].source_start_us).toBe(2_000_000);
expect(sourceToEdited(tl, 4_000_000)).toEqual({ inCut: false, us: 2_500_000 });
expect(sourceToEdited(tl, 3_000_000)).toEqual({ inCut: true, us: 2_000_000 });
expect(editedToSource(tl, 5_500_000)).toBe(7_500_000); expect(editedToSource(tl, 1_999_999)).toBe(1_999_999);
for (const us of [0, 1_234_567, 3_500_000, 6_999_999, 9_999_999]) expect(editedToSource(tl, (sourceToEdited(tl, us) as { us: number }).us)).toBe(us);
expect(mapWords(tl, [w("w3", 3_400_000, 3_700_000), w("w4", 2_100_000, 2_400_000)])).toEqual({
  w3: { state: "clipped", edited_start_us: 2_000_000, edited_end_us: 2_200_000 }, w4: { state: "removed" } });
const r = rangeFromWords(tl, words /* w5: 4_000_000–4_300_000 … w9: 5_700_000–6_000_000 */, "w5", "w9", { preUs: 200_000, postUs: 300_000 });
expect(r).toEqual({ edited: { start_us: 2_300_000, end_us: 4_800_000 }, source: { start_us: 3_800_000, end_us: 6_300_000 }, frames: { start: 69, end: 144 } });
expect(verifyQuote(ws("Мы", "выросли", "до", "1", "000", "000", "пользователей."), "w1", "w7", "мы выросли до 1 000 000 пользователей")).toEqual({ ok: true });
expect(verifyQuote(ws("Мы", "выросли", "до", "миллиона."), "w1", "w4", "мы выросли до ста")).toMatchObject({ ok: false, code: "quote_mismatch" });
expect(normalizeToken("Ещё,")).toBe("еще");
expect(canonicalHash({ b: 1, a: [2, 1] })).toBe(canonicalHash({ a: [2, 1], b: 1 }));
expect(canonicalHash({ a: [1, 2] })).not.toBe(canonicalHash({ a: [2, 1] }));
expect(VisualPlannerOutputSchema.safeParse(planner({ decision: "plan", composition_mode: "none" })).success).toBe(false);
expect(VisualPlannerOutputSchema.safeParse(planner({ decision: "plan", evidence: [] })).success).toBe(false);
expect(EditDecisionSchema.safeParse(dec({ confidence: 1.2 })).success).toBe(false);
for (const s of [RoughCutAgentOutputSchema, FootageAgentOutputSchema, SemanticAgentOutputSchema, VisualPlannerOutputSchema])
  expect(JSON.stringify(toJsonSchema(s))).not.toContain("$ref");
```

- [x] **Step 2: Запустить** `./scripts/with-node.sh npx vitest run contracts` — FAIL.
- [x] **Step 3: Реализовать** (только чистые функции и схемы, без `node:` импортов, кроме `canonical.ts` — sha256 через `node:crypto`; для `web` — экспорт `canonical.ts` отдельно не нужен).
- [x] **Step 4: Запустить** — PASS; `./check`; коммит `feat(motion-studio): контракты видеопроекта и таймкоды`.

Уточнения при реализации (2026-10-23):
- `canonical.ts` не входит в индекс: импорт `@ms/contracts/canonical` (subpath в `contracts/package.json`), иначе `node:crypto` попадает в web.
- `usToFrameCeil(us)` — первый кадр, чей `frameToUs` не раньше `us` (двойственно `usToFrame`, R10): `usToFrameCeil(frameToUs(f)) === f` для любых fps; голый `ceil` давал `f + 1` на NTSC.
- `CompositionModeSchema` — общий с Concept (`concept.ts`), не дублируется; новые коды `JobError` — в `JobErrorCodeSchema` (`failure.ts`).
- `buildTimeline`: конец вырезки `>= source_duration_us` не выравнивается (вырезка «до конца» доходит до конца исходника); вырезки, пустые после выравнивания, отбрасываются.
- `rangeFromWords`: поля `pad` — в edited (в пределах `[0, duration_us]`), source — образ edited-границ; граничное слово вырезано целиком → `TimelineError("anchor_in_cut")`, неизвестное — `unknown_word`, обратный порядок — `order`. Кадры — `[usToFrame(start), usToFrameCeil(end))`.
- `PlanOp.modify.patch.key_terms` — `{ text; word_id }` без `edited_at_us` (время считает код).
- `jsdom` поднят в корневые devDependencies: после чистого `npm ci` по прежнему lock-файлу он оказывался только в `web/node_modules`, и Vitest (в корне) не находил окружение web.

### Task 24: Данные видеопроекта — миграция, ArtifactStore, замки ресурсов, approvals

**Files:**
- Create: `app/motion-studio/server/src/db/migrations/002_video.sql`
- Create: `app/motion-studio/server/src/db/repos/{media,transcripts,edls,approvals,footage,semantic,plans,styles,resource-locks}.ts`
- Create: `app/motion-studio/server/src/artifacts/{store.ts,paths.ts,job-draft.ts}`, `app/motion-studio/server/src/approvals/{engine.ts,subjects.ts}`
- Modify: `app/motion-studio/server/src/jobs/{queue.ts,locks.ts,types.ts,runner.ts}` (замки ресурсов, `heavy`), `app/motion-studio/server/src/scenes/{ids.ts,store.ts}` (`newId` — новые префиксы; `quarantineDraft(draft: Pick<Draft, "dir">, reason)`), `app/motion-studio/server/src/config.ts` (`AppConfig` += `asr`, `media`, `roughcut`, `planning`, `analysis`; `Role` += 4 роли)
- Test: `app/motion-studio/server/test/db/migrate-002.test.ts`, `app/motion-studio/server/test/artifacts/store.test.ts`, `app/motion-studio/server/test/jobs/resource-locks.test.ts`, `app/motion-studio/server/test/approvals/engine.test.ts`, `app/motion-studio/server/test/agents/config-video.test.ts`

**Interfaces:**
- Consumes: `openDb`, `migrate`, `Db`, repos `projects`, `jobs` (Task 11); `claimNext`, `finish`, `fenceOk`, `SCENE_WRITING_TYPES`, `JobContext`, `Semaphore`, `JobRunner` (Task 12); `Draft`, `quarantineDraft`, `newId`, хеш-утилиты `scenes/hash.ts` (Task 9); `safeMkdir`, `StorageStatus` (Task 1); `loadConfig`, `AppConfig`, `Role` (Task 7); `canonicalHash`, `ApprovalSchema`, все схемы Task 23
- Produces:
  - `002_video.sql`: `media_assets(id PK, project_id FK, original_name, rel_path, sha256, size_bytes, probe_json, timeline_fps_num, timeline_fps_den, vfr, rotation, duration_us, has_audio, status, created_by_job_id, created_at, UNIQUE(project_id))`; `media_derivatives(media_id, kind, rel_path, sha256, params_json, PRIMARY KEY(media_id, kind))`; `transcripts(id PK, project_id, media_id, current_revision, language, created_at)`; `transcript_revisions(transcript_id, revision, parent_revision, rel_path, sha256, author, created_at, PK(transcript_id, revision))`; `transcript_words(transcript_id, revision, idx, word_id, text, start_us, end_us, timing, PK(transcript_id, revision, idx))`; `transcript_segments(transcript_id, revision, segment_id, first_idx, last_idx, start_us, end_us)`; `edls(id PK, project_id, media_id, transcript_id, current_revision)`; `edl_revisions(edl_id, revision, parent_revision, rel_path, sha256, hash, created_at)`; `edit_decisions(edl_id, revision, decision_id, reason, origin, status, start_word_id, end_word_id, source_start_us, source_end_us, confidence)`; `timelines(edl_id, revision, fps_num, fps_den, duration_us, PK(edl_id, revision))`; `timeline_clips(edl_id, revision, idx, source_start_us, source_end_us, edited_start_us)`; `approvals(id PK, project_id, kind, subject_ref, subject_hash, status, stale_reason, decided_at)`; `footage_analyses(id PK, project_id, media_id, mode, rel_path, sha256, created_at)`; `semantic_analyses(id PK, project_id, transcript_id, transcript_revision, edl_id, edl_revision, rel_path, sha256, created_at)`; `semantic_chapters(analysis_id, chapter_id, title, start_word_id, end_word_id)`; `style_bibles(id PK, project_id, current_revision)`, `style_revisions(style_id, revision, rel_path, sha256, hash, author, created_at)`; `visual_plans(id PK, project_id, current_revision)`; `visual_plan_revisions(plan_id, revision, parent_revision, rel_path, sha256, hash, created_at)`; `visual_opportunities(plan_id, revision, opp_id, decision, anchor_ids_json, skip_reason)`; `scene_plans(plan_id, revision, item_id, status, composition_mode, zone, edited_start_us, edited_end_us, start_word_id, end_word_id, visual_type)`; `resource_locks(resource PK, job_id, acquired_at)`; `projects.kind` уже допускает `video`
  - `artifactPaths(root, projectId)`: `source(mediaId)`, `proxy(mediaId)`, `transcriptRev(id, n)`, `edlRev(id, n)`, `footage(id)`, `semantic(id)`, `styleRev(id, n)`, `planRev(id, n)` — каталоги `workspace/projects/<p>/{source,proxy,transcript,edits,analysis/footage,analysis/semantic,style,plan}/…`
  - `createJobDraft(root: string, ref: { runId: string; attempt: number }): Promise<{ dir: string; runId: string; attempt: number }>` — `workspace/drafts/<runId>-a<attempt>/`, существующий — ошибка
  - `class ArtifactStore`: `constructor(deps: { root: string; db: Db; guard: () => Promise<StorageStatus> })`; `publish(draftDir: string, destRel: string, register: (db: Db, files: { path: string; sha256: string }[]) => void, fence?: { jobId: string; attempt: number }): Promise<{ dir: string; files: { path; sha256 }[] }>` — `await guard()`, затем `BEGIN IMMEDIATE`: fencing (если `fence`) → `renameSync` → `chmod -R a-w` → `register`; несовпадение `attempt` → `fenced_out` + `.quarantined`; сбой `register` → обратный `renameSync`; `writeRevision(destRel, doc: unknown, register, guard)` — для синхронных правок (JSON-документ через временный draft `drafts/sync-<ulid>`)
  - `lockKeyFor(job: Job): string | undefined` — типы Phase 1 → `scene:<sceneId>` (поведение Task 12 сохраняется); `media.import` → `project:<p>:media`; `asr.transcribe` → `project:<p>:transcript`; `roughcut.propose` → `project:<p>:edl`; `footage.analyze` → `…:footage`; `semantic.analyze` → `…:semantic`; `plan.visual`, `plan.recheck` → `…:plan`; `roughcut.preview` → `undefined`
  - `claimNext` (modify) — проверяет и берёт `resource_locks` для `lockKeyFor(job)` в той же транзакции; `finish` снимает; `resourceBusy(db, key): { jobId: string } | undefined` — для синхронных правок API
  - `JobContext.heavy: Semaphore` (1) — тяжёлые модели (ASR)
  - `approve(db, input: { projectId; kind: ApprovalKind; subjectRef: string; subjectHash: string }): Approval` — прежние `valid` того же `kind` → `revoked`
  - `approvalState(db, projectId: string, kind: ApprovalKind, current: { ref: string; hash: string } | undefined): { state: "missing" | "valid" | "stale"; approval?: Approval; reason?: Approval["stale_reason"] }` — несовпадение `ref`/`hash` → `stale` (`subject_changed`) с записью в БД
  - `cascadeStale(db, projectId, from: "A" | "style"): number` — `A` → валидный B `stale(upstream_A)`; `style` → B `stale(style_changed)`
  - `currentSubject(db, projectId, kind: "A" | "B"): { ref: string; hash: string } | undefined` (`subjects.ts`) — A: текущая ревизия EDL; B: текущая ревизия плана
  - `AppConfig` (modify): `asr: { python: string /* "~/.local/share/montage/mlx-audio-0.5.8/.venv/bin/python", env AIP_MONTAGE_ASR_PYTHON */; aiPlatformRoot: string /* "/Users/stalyzade/my_track/01_It_development/ai-platform", env AI_PLATFORM_ROOT */; modelsDir: string /* "/Volumes/External SSD/local_models", env AIP_MODELS_DIR */; model: "whisper-large-v3-turbo" | "whisper-large-v3-mlx"; language: string /* "ru" */; expectedWorkerSha256: string; timeoutMs: number /* 14_400_000 */; noOutputTimeoutMs: number /* 1_800_000 */ }`; `media: { importRoots: string[]; proxyShortSide: 720; thumbEveryUs: 2_000_000 }`; `roughcut: { pauseMinUs: 800_000; keepAfterWordUs: 100_000; sentenceKeepAfterUs: 300_000; keepBeforeWordUs: 100_000; fillerPadUs: 50_000; loudDbfs: -30; fadeUs: 8_000 }`; `planning: { maxCoverage: 0.4; maxFullscreenCoverage: 0.25; minGapUs: 1_500_000; minSceneUs: 1_500_000; maxSceneUs: 12_000_000; padPreUs: 200_000; padPostUs: 300_000; faceMargin: 0.25; faceOverlapMax: 0.02 }`; `analysis: { maxCostUsd: 3 }`; `agents.{rough_cut_editor,footage_analyst,semantic_director,visual_planner}.model = "sonnet"`

- [ ] **Step 1: Тесты (падают),** хранилище в `tmp/`:

```ts
expect(migrate(db)).toEqual({ from: 1, to: 2 });
expect(() => media.insert(db, asset({ project_id: "p1", id: "med_2" }))).toThrow(/UNIQUE/);   // второй исходник в проект
// fencing публикации артефакта
jobs.update(db, "job_1", { attempt: 2 });
await expect(store.publish(d1.dir, "transcript/trn_1/r1", reg, { jobId: "job_1", attempt: 1 })).rejects.toThrow(/fenced_out/);
expect(existsSync(join(d1.dir, ".quarantined"))).toBe(true);
const pub = await store.publish(d2.dir, "transcript/trn_1/r1", reg, { jobId: "job_1", attempt: 2 });
await expect(writeFile(join(pub.dir, "transcript.json"), "{}")).rejects.toMatchObject({ code: "EACCES" });
// замки ресурсов
enqueue(db, rc("p1", "k1")); enqueue(db, rc("p1", "k2")); enqueue(db, preview("p1", "k3"));
expect(claimNext(db, "srv", 0, idle)!.job.idempotency_key).toBe("k1");
expect(claimNext(db, "srv", 0, idle)!.job.type).toBe("roughcut.preview");     // без замка
expect(claimNext(db, "srv", 0, idle)).toBeUndefined();                          // k2 ждёт project:p1:edl
expect(resourceBusy(db, "project:p1:edl")).toMatchObject({ jobId: expect.any(String) });
expect(lockKeyFor(job({ type: "playground.edit", scene_id: "scn_1" }))).toBe("scene:scn_1");
// approvals
approve(db, { projectId: "p1", kind: "A", subjectRef: "edl:edl_1@r2", subjectHash: "h2" });
expect(approvalState(db, "p1", "A", { ref: "edl:edl_1@r2", hash: "h2" }).state).toBe("valid");
approve(db, { projectId: "p1", kind: "B", subjectRef: "plan:pln_1@r1", subjectHash: "p1h" });
expect(approvalState(db, "p1", "A", { ref: "edl:edl_1@r3", hash: "h3" })).toMatchObject({ state: "stale", reason: "subject_changed" });
expect(cascadeStale(db, "p1", "A")).toBe(1);
expect(approvalState(db, "p1", "B", { ref: "plan:pln_1@r1", hash: "p1h" })).toMatchObject({ state: "stale", reason: "upstream_A" });
expect(approvalState(db, "p1", "A", undefined).state).toBe("missing");
// конфиг
expect(loadConfig({ MS_DATA_DIR: root }).asr.expectedWorkerSha256).toBe("59b7e03bf5a8b7f940b2607d357528e7120f5bb6bbe98efa70de4b39bdce1073");
expect(loadConfig({ MS_DATA_DIR: root, AIP_MODELS_DIR: "/x" }).asr.modelsDir).toBe("/x");
expect(loadConfig({ MS_DATA_DIR: root }).agents.visual_planner.model).toBe("sonnet");
```

- [ ] **Step 2: Запустить** `./scripts/with-node.sh npx vitest run server/test/{db,artifacts,jobs,approvals,agents}` — FAIL.
- [ ] **Step 3: Реализовать.** Существующие тесты Task 11–13 остаются зелёными (замок сцены — частный случай ресурса).
- [ ] **Step 4: Запустить** — PASS; `./check`; коммит `feat(motion-studio): данные видеопроекта, артефакты и approvals`.

### Task 25: Импорт видео — ffprobe, оригинал, прокси, waveform, миниатюры (`media.import`)

**Files:**
- Create: `app/motion-studio/server/src/media/{probe.ts,vfr.ts,import.ts,space.ts,ffmpeg.ts,proxy.ts,waveform.ts,thumbs.ts,audio.ts,guards.ts}`
- Create: `app/motion-studio/server/src/pipeline/media-import.ts`; Modify: `app/motion-studio/server/src/jobs/handlers.ts`
- Create: `app/motion-studio/scripts/make-media-fixtures.mjs` — в `tmp/media-fixtures/`: `talk-ru-cfr.mp4` (1280×720, 30/1, `testsrc2` + речь `say -v Milena` с паузами `[[slnc 1500]]`, ≈ 20 с), `talk-ru-vfr.mov` (части 25 и 30 fps, склейка concat-демуксером `-c copy`), `rotated.mov` (`-display_rotation 90`), `no-audio.mp4`, `broken.mp4` (обрезанный файл); печатает ffprobe каждого
- Modify: `app/motion-studio/server/src/cli/doctor.ts` — фильтры `silencedetect`, `scdet`, энкодер `libx264`
- Test: `app/motion-studio/server/test/media/{probe,vfr,space,guards,waveform,ffmpeg-progress}.test.ts`, `app/motion-studio/server/test/fixtures/ffprobe/{cfr,vfr,rotated,no-audio}.json` (реальные выводы ffprobe фикстур), `app/motion-studio/server/test/media/import.e2e.test.ts`

**Interfaces:**
- Consumes: `spawnTracked`, `ProcessRegistry` (Task 2, 13); `JobHandler`, `JobContext` (Task 12, 24); `ArtifactStore`, `createJobDraft`, `artifactPaths`, `media` repo (Task 24); `checkStorage`, `StorageStatus`, `macosProbe.freeBytes`, `macosProbe.deviceId` (Task 1); `snapFps`, `parseRational`, `ProbeSummarySchema`, `MediaManifestSchema` (Task 23); `AppConfig.media` (Task 24)
- Produces:
  - `probeMedia(path: string): Promise<ProbeSummary>` — `ffprobe -v error -print_format json -show_format -show_streams` + `-read_intervals %+30 -select_streams v:0 -show_entries packet=pts_time` для VFR; `parseProbe(json: unknown, ptsUs: number[]): ProbeSummary` — чистая функция
  - `detectVfr(ptsUs: number[]): { vfr: boolean; meanDeltaUs: number; maxDeltaUs: number }` — `vfr`, если `std(Δ)/mean(Δ) > 0.02`
  - `estimateImportBytes(i: { sizeBytes: number; durationUs: number; sameVolume: boolean }): number` — `(sameVolume ? 0 : size) + 312_500·dur_s (прокси) + 32_000·dur_s (audio16k) + 50_000_000`
  - `checkImportSpace(est: number, freeBytes: number, minFreeBytes: number): { ok: true } | { ok: false; code: "low_space"; needBytes: number }`
  - `resolveImportPath(p: string, roots: string[]): Promise<string>` — `realpath`, регулярный файл, внутри одного из корней, расширение ∈ {`mov`,`mp4`,`m4v`,`mkv`,`webm`}; иначе `media_invalid`
  - `assertOutsideSource(outPath: string, root: string): void` — выход в `…/source/…` или равный пути оригинала → ошибка
  - `copyOriginal(src: string, destDir: string): Promise<{ path: string; sha256: string; cloned: boolean; srcSha256Before: string; srcSha256After: string }>` — `COPYFILE_FICLONE`, при `ENOTSUP`/другом томе — потоковая копия; sha256 источника до и после, копии; расхождение → ошибка, копия удаляется
  - `runFfmpeg(args: string[], o: { run: RunRef; signal: AbortSignal; registry?: ProcessRegistry; durationUs?: number; onProgress?: (p: number) => void }): Promise<{ code: number; stderrTail: string }>` — `-progress pipe:1 -nostats`, `parseFfmpegProgress(line): number | undefined` (`out_time_us=…`)
  - `proxyArgs(input: string, out: string, probe: ProbeSummary, shortSide: number): string[]` — H.264 `veryfast` CRF 23, короткая сторона 720, `-fps_mode cfr -r <timeline_fps>`, `-g 2·fps`, AAC 128k 48 кГц, `-af aresample=async=1:first_pts=0`, `-movflags +faststart`, автоповорот
  - `extractAudio16k(input, out, o)` — `-ac 1 -ar 16000 -c:a pcm_s16le`; `peaksFromPcm(pcm: Int16Array, sampleRate: number, bucketMs: number): Int8Array` — пары min/max на ведро (масштаб `/256`); `waveform.json = { bucket_ms: 10; sample_rate: 16000; length: number; file: "waveform.bin" }`
  - `thumbsArgs(input, outDir, everyUs, height: 180)` — `fps=1/<s>` JPEG `thumbs/%06d.jpg`; `thumbs.json = { every_us; count }`
  - `mediaImport: JobHandler` — вход `{ projectId; method: "path"; path } | { projectId; method: "upload"; uploadPath /* draft-файл из API */; originalName }`; шаги и прогресс: `probe` (битый файл → `media_invalid`, без видео → `media_invalid`) → `space` (`estimateImportBytes` + `checkStorage`) → `copy` → `proxy` → `audio16k` (нет аудио → пропуск, `has_audio = 0`) → `waveform` → `thumbs` → публикация `source/<med>/` и `proxy/<med>/` с fencing → `media_assets`, `media_derivatives`; повторный sha256 в проекте → существующий ассет; при первом импорте `projects.settings_json.timeline_fps = probe.timeline_fps`, `aspect_ratio` по `display_*`

- [ ] **Step 1: Юнит-тесты (падают):**

```ts
const cfr = parseProbe(fx("cfr.json"), ptsCfr);
expect(cfr).toMatchObject({ video: { width: 1280, height: 720, rotation: 0 }, vfr: false, timeline_fps: { num: 30, den: 1 }, audio: { sample_rate: expect.any(Number) } });
expect(parseProbe(fx("rotated.json"), ptsCfr)).toMatchObject({ video: { display_width: 720, display_height: 1280 } });
expect(Math.abs(parseProbe(fx("rotated.json"), ptsCfr).video.rotation)).toBe(90);
expect(parseProbe(fx("no-audio.json"), ptsCfr).audio).toBeUndefined();
expect(detectVfr(Array.from({ length: 300 }, (_, i) => i * 33_333)).vfr).toBe(false);
expect(detectVfr(Array.from({ length: 300 }, (_, i) => i * 33_333 + (i % 2) * 6_000)).vfr).toBe(true);
expect(estimateImportBytes({ sizeBytes: 1e9, durationUs: 100_000_000, sameVolume: false })).toBe(1_084_450_000);
expect(estimateImportBytes({ sizeBytes: 1e9, durationUs: 100_000_000, sameVolume: true })).toBe(84_450_000);
expect(checkImportSpace(3e9, 12 * 2 ** 30, 10 * 2 ** 30)).toMatchObject({ ok: false, code: "low_space" });
expect(checkImportSpace(1e9, 12 * 2 ** 30, 10 * 2 ** 30)).toEqual({ ok: true });
await expect(resolveImportPath("/etc/passwd", [tmpRoot])).rejects.toThrow(/media_invalid/);
await expect(resolveImportPath(symlinkInsideRootTo("/etc/hosts"), [tmpRoot])).rejects.toThrow(/media_invalid/);
expect(() => assertOutsideSource(join(root, "workspace/projects/p1/source/med_1/x.mp4"), root)).toThrow(/source/);
expect(parseFfmpegProgress("out_time_us=1234567")).toBe(1_234_567);
expect(Array.from(peaksFromPcm(alternating(1600, 16384), 16000, 10)).slice(0, 4)).toEqual([-64, 64, -64, 64]);
expect(peaksFromPcm(alternating(1600, 16384), 16000, 10).length).toBe(20);
```

- [ ] **Step 2: e2e (`make e2e`),** `node scripts/make-media-fixtures.mjs`, хранилище `tmp/` с `MS_ALLOW_SYSTEM_DISK=1`, реальный `bootCore` и задача:

```ts
const before = await sha256File(fixture("talk-ru-cfr.mp4"));
const j = await runJob(core, "media.import", { projectId, method: "path", path: fixture("talk-ru-cfr.mp4") });
expect(j.status).toBe("completed");
const a = media.getByProject(core.db, projectId)!;
expect(await sha256File(fixture("talk-ru-cfr.mp4"))).toBe(before); expect(a.sha256).toBe(before);
expect((await stat(join(root, a.rel_path))).mode & 0o222).toBe(0);
const px = await probeMedia(derivative(a, "proxy"));
expect(px.video.height).toBe(720); expect(px.timeline_fps).toEqual({ num: 30, den: 1 }); expect(px.vfr).toBe(false);
expect(Math.abs(px.duration_us - a.duration_us)).toBeLessThanOrEqual(33_334);
// VFR: таймлайн CFR, длительность сохранена
const v = await importFixture("talk-ru-vfr.mov");
expect(v.probe.vfr).toBe(true); expect((await probeMedia(derivative(v, "proxy"))).vfr).toBe(false);
// поворот: прокси в отображаемой ориентации
expect((await probeMedia(derivative(await importFixture("rotated.mov"), "proxy"))).video).toMatchObject({ width: 720, height: 1280 });
// без аудио — импорт успешен, has_audio 0; битый файл — failed media_invalid, в source/ ничего нет
// повторный импорт того же файла → тот же media id, deduplicated
// kill: abort во время proxy → группа ffmpeg убита, run/processes пуст, source/ проекта пуст, draft удалён или .quarantined
```

- [ ] **Step 3: Запустить** — FAIL. **Step 4: Реализовать.** **Step 5: Запустить** — PASS; время импорта и размер прокси фикстур — в отчёт.
- [ ] **Step 6:** `./check`; `make e2e` (media); коммит `feat(motion-studio): импорт видео, прокси, waveform и миниатюры`.

### Task 26: ASR через CLI-воркер ai-platform (`asr.transcribe`) и сегментация

**Files:**
- Create: `app/motion-studio/server/src/media/{asr-adapter.ts,asr-capability.ts,asr-splits.ts,asr-contract.ts,segments.ts}`
- Create: `app/motion-studio/server/src/pipeline/asr-transcribe.ts`; Modify: `app/motion-studio/server/src/jobs/handlers.ts`, `app/motion-studio/server/src/cli/doctor.ts` (python, воркер, sha256, коммит, модель, порт 8780)
- Create: `app/motion-studio/server/test/fixtures/asr/{words-ok.json,words-bad-order.json,words-extra-field.json}`, `app/motion-studio/server/test/fixtures/bin/fake-asr-worker.py` (только для юнит-тестов: печатает `PROGRESS`, пишет `--out`, умеет «висеть» и игнорировать SIGTERM)
- Test: `app/motion-studio/server/test/media/{asr-splits,asr-contract,asr-args,asr-capability,segments,asr-progress}.test.ts`, `app/motion-studio/server/test/media/asr.e2e.test.ts`

**Interfaces:**
- Consumes: `spawnTracked`, `childEnv` (Task 2, 7); `JobHandler`, `JobContext.heavy` (Task 12, 24); `ArtifactStore`, `transcripts` repo (Task 24); `extractAudio16k`, `runFfmpeg`, `derivative` audio16k (Task 25); `TranscriptRevisionDocSchema`, `TranscriptWord` (Task 23); `AppConfig.asr` (Task 24)
- Produces:
  - `AsrWorkerOutputSchema = z.object({ language: z.string(), duration: z.number(), elapsed_s: z.number(), words: z.array(z.object({ w: z.string(), s: z.number().min(0), e: z.number().min(0) }).strict().refine(x => x.s <= x.e)) }).strict()` + проверка неубывания `s`
  - `asrCapability(cfg: AppConfig["asr"], deps?: { exists; sha256File; gitHead; portBusy }): Promise<{ available: true; workerSha256: string; commit: string; gpuContention: boolean } | { available: false; reason: "python_missing" | "worker_missing" | "model_missing" | "asr_contract_changed" | "models_volume_offline"; detail: string }>`
  - `chooseSplits(silences: { start_s: number; end_s: number }[], durationS: number, maxChunkS = 290): number[]` — в каждом окне — середина самой поздней тишины, чья середина ≤ начало окна + `maxChunkS`; нет тишины → жёсткий разрез
  - `parseSilencedetect(stderr: string): { start_s; end_s }[]`
  - `buildAsrArgs(cfg, i: { audio: string; out: string; language: string; splits: number[]; hotwords: string[] }): string[]` — `[<aiPlatformRoot>/app/platform/aiplatform/montage/asr_worker.py, "--kind", "whisper", "--model", <modelsDir>/asr/<model>, "--audio", …, "--out", …, "--language", …, ("--splits", "a,b"), ("--hotwords", "x|y")]`
  - `parseProgress(line: string): { percent: number; stage: string } | undefined` — `PROGRESS 42.5 кусок 2 из 3`
  - `toTranscriptWords(out: AsrWorkerOutput): TranscriptWord[]` — `id = "w_" + 6 цифр`, `start_us = Math.round(s·1e6)`, `timing: "asr"`, `confidence: null`, пустые `w` отбрасываются
  - `buildSegments(words: TranscriptWord[], o: { pauseUs: 700_000; sentencePauseUs: 250_000; maxUs: 12_000_000 }): TranscriptSegment[]` — разрыв при паузе ≥ `pauseUs`, либо после `[.?!…]` при паузе ≥ `sentencePauseUs`, либо при превышении `maxUs` — по наибольшей паузе внутри
  - `class AsrAdapter`: `constructor(cfg: AppConfig["asr"], deps: { spawn: typeof spawnTracked })`; `transcribe(i: { audio16k: string; durationUs: number; language: string; hotwords: string[]; workdir: string; run: RunRef; signal: AbortSignal; registry?: ProcessRegistry; onProgress(p: number, stage: string): void }): Promise<{ output: AsrWorkerOutput; splits: number[]; elapsedMs: number }>` — env = `childEnv` + `PYTHONNOUSERSITE=1`; таймаут общий `timeoutMs`, без вывода — `noOutputTimeoutMs`; отмена — `spawnTracked` (группа)
  - `asrTranscribe: JobHandler` — вход `{ projectId; mediaId; language?; model?; hotwords?: string[] }`; `has_audio = 0` → `failed(no_audio)`; `asrCapability` → `unavailable` → `failed(asr_unavailable | asr_contract_changed)`; `silencedetect -35dB:d=0.4` по `audio16k.wav` → `chooseSplits` → `ctx.heavy.acquire()` → `gpuContention` → событие-предупреждение → `transcribe` → `AsrWorkerOutputSchema` (нарушение → `asr_contract_violation`, вывод воркера сохраняется в журнал задачи) → `|duration − media| ≤ 0.1 с` → ревизия `r1` (`author: "asr"`, `asr: { model, worker_sha256, ai_platform_commit, elapsed_s }`, `segments`) → `ArtifactStore.publish` с fencing → `transcripts`, `transcript_revisions`, `transcript_words`, `transcript_segments`

- [ ] **Step 1: Юнит-тесты (падают),** фейковый воркер — только логика:

```ts
expect(chooseSplits([{ start_s: 100, end_s: 101 }, { start_s: 280, end_s: 282 }, { start_s: 400, end_s: 400.5 }, { start_s: 560, end_s: 563 }], 700)).toEqual([281, 561.5]);
expect(chooseSplits([], 700)).toEqual([290, 580]);
expect(chooseSplits([], 120)).toEqual([]);
expect(parseProgress("PROGRESS 42.5 кусок 2 из 3")).toEqual({ percent: 42.5, stage: "кусок 2 из 3" });
expect(parseProgress("loading weights")).toBeUndefined();
expect(buildAsrArgs(cfg, { audio: "/d/a.wav", out: "/d/w.json", language: "ru", splits: [281, 561.5], hotwords: ["Claude Code", "Remotion"] })).toEqual([
  "/AIP/app/platform/aiplatform/montage/asr_worker.py", "--kind", "whisper", "--model", "/M/asr/whisper-large-v3-turbo",
  "--audio", "/d/a.wav", "--out", "/d/w.json", "--language", "ru", "--splits", "281,561.5", "--hotwords", "Claude Code|Remotion"]);
expect(AsrWorkerOutputSchema.safeParse(fx("words-bad-order.json")).success).toBe(false);
expect(AsrWorkerOutputSchema.safeParse(fx("words-extra-field.json")).success).toBe(false);
expect(toTranscriptWords({ language: "ru", duration: 3, elapsed_s: 1, words: [{ w: "Привет.", s: 0.12, e: 0.5 }, { w: " ", s: 0.6, e: 0.6 }, { w: "Мир", s: 1.9, e: 2.3 }] }))
  .toEqual([{ id: "w_000001", text: "Привет.", start_us: 120_000, end_us: 500_000, timing: "asr", confidence: null },
            { id: "w_000002", text: "Мир", start_us: 1_900_000, end_us: 2_300_000, timing: "asr", confidence: null }]);
expect(buildSegments([w("a", 0, 300_000), w("конец.", 400_000, 800_000), w("c", 1_100_000, 1_400_000), w("d", 2_500_000, 2_900_000)], defaults).map(s => s.word_ids.length)).toEqual([2, 1, 1]);
expect((await asrCapability({ ...cfg, python: "/nope" })).reason).toBe("python_missing");
expect((await asrCapability(cfg, { ...deps, sha256File: async () => "deadbeef" })).reason).toBe("asr_contract_changed");
// heavy: две задачи ASR разных проектов — вторая ждёт семафор, не стартует воркер
// отмена: фейковый воркер висит → requestCancel → группа убита, cancelled, транскрипта нет
// фейковый воркер пишет words-bad-order.json → failed asr_contract_violation, transcripts пуст
```

- [ ] **Step 2: e2e (`make e2e`),** реальный воркер ai-platform на `talk-ru-cfr.mp4` (импорт Task 25):

```ts
const t = await runJob(core, "asr.transcribe", { projectId, mediaId, language: "ru" });
expect(t.status).toBe("completed");
const doc = await readTranscript(core, projectId);                     // r1
expect(doc.asr).toMatchObject({ model: "whisper-large-v3-turbo", worker_sha256: cfg.asr.expectedWorkerSha256 });
const text = doc.words.map(x => normalizeToken(x.text)).join(" ");
expect(text).toMatch(/пользовател/); expect(text).toMatch(/миллион|1 ?000 ?000/);
doc.words.forEach((x, i) => { expect(x.start_us).toBeLessThanOrEqual(x.end_us); if (i) expect(x.start_us).toBeGreaterThanOrEqual(doc.words[i - 1].start_us); });
expect(maxGap(doc.words)).toBeGreaterThanOrEqual(1_200_000);           // пауза [[slnc 1500]] видна в таймингах
expect(doc.segments.length).toBeGreaterThanOrEqual(2);
// kill -9 во время ASR (дочерний node с bootCore) → после рестарта воркер мёртв, задача pending → completed
```

- [ ] **Step 3–4:** FAIL → реализовать → PASS. Время ASR (×реального времени) и пиковая память — в отчёт.
- [ ] **Step 5:** `./check`; `make e2e` (asr); коммит `feat(motion-studio): ASR через воркер ai-platform`.

### Task 27: Правка транскрипта и ревизии EDL (без LLM)

**Files:**
- Create: `app/motion-studio/server/src/edit/{transcript-ops.ts,align.ts,edl-ops.ts,timeline-store.ts,approval-a.ts}`
- Test: `app/motion-studio/server/test/edit/{transcript-ops,align,edl-ops,timeline-store,approval-a}.test.ts`

**Interfaces:**
- Consumes: `TranscriptRevisionDoc`, `TranscriptOp`, `normalizeToken`, `EdlRevisionDoc`, `EdlOp`, `acceptedCuts`, `buildTimeline`, `mapWords`, `snapUsToFrame`, `canonicalHash` (Task 23); `ArtifactStore.writeRevision`, `resourceBusy`, `approve`, `approvalState`, `cascadeStale`, `currentSubject`, repos `transcripts`, `edls` (Task 24); `buildSegments` (Task 26)
- Produces:
  - `alignTokens(oldWords: TranscriptWord[], newText: string): { kept: { word_id: string; text: string }[]; inserted: { after_word_id: string | null; text: string }[]; removed: string[] }` — LCS по `normalizeToken`; пунктуация к соседу
  - `applyTranscriptOps(doc: TranscriptRevisionDoc, ops: TranscriptOp[]): TranscriptRevisionDoc` — новая ревизия: `revision + 1`, `parent_revision`, `author: "user"`; совпавшие токены сохраняют `id` и время; вставленные — `id = "<предыдущий>.<k>"`, время интерполировано в промежутке соседей (`timing: "interpolated"`); удалённые → `removed_word_ids`; сегменты пересчитываются `buildSegments`
  - `saveTranscriptRevision(deps: { db; store; root }, transcriptId: string, body: { base_revision: number; ops: TranscriptOp[] }): Promise<TranscriptRevisionDoc>` — `base_revision ≠ current` → `revision_conflict`; занят `project:<p>:transcript` → `resource_busy`
  - `applyEdlOps(doc: EdlRevisionDoc, ops: EdlOp[], words: TranscriptWord[], fps: Fps): EdlRevisionDoc` — `add_cut` по словам = `[first.start_us, max(last.end_us, next(last).start_us − keepBeforeWordUs)]` (у последнего слова транскрипта — `last.end_us`), выравнивание `snapUsToFrame`, `origin: "user"`, `status: "accepted"`, `reason: "manual"`; `set_status`; `remove` (только `origin: "user"`, иначе — `rejected`)
  - `saveEdlRevision(deps, edlId, body: { base_revision; ops: EdlOp[] }): Promise<{ doc: EdlRevisionDoc; timeline: EditedTimeline }>` — пишет ревизию, `timelines`/`timeline_clips`; затем `approvalState(…, "A", currentSubject)` → при `stale` — `cascadeStale("A")`
  - `timelineFor(db, edlId: string, revision?: number): EditedTimeline` — из `timeline_clips` (инвариант: равно `buildTimeline(acceptedCuts(doc))`)
  - `approveRoughCut(db, projectId): Approval` — ошибка `proposed_left` (с числом), если есть `status = "proposed"`; `subject_ref = "edl:<id>@r<N>"`, `subject_hash = canonicalHash(doc)`
  - `roughCutApprovalValid(db, projectId): boolean` — для гейтов `semantic.analyze`/`plan.visual`

- [ ] **Step 1: Тесты (падают):**

```ts
const doc = trDoc([w("w_000001", "привет", 0, 400_000), w("w_000002", "мир", 500_000, 900_000), w("w_000003", "как", 1_000_000, 1_200_000)]);
expect(applyTranscriptOps(doc, [{ op: "replace_text", word_id: "w_000002", text: "Мир!" }]).words[1]).toMatchObject({ id: "w_000002", text: "Мир!", start_us: 500_000 });
const ins = applyTranscriptOps(doc, [{ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000002", text: "Привет большой мир" }]);
expect(ins.words.map(x => x.id)).toEqual(["w_000001", "w_000001.1", "w_000002", "w_000003"]);
expect(ins.words[1]).toMatchObject({ text: "большой", start_us: 400_000, end_us: 500_000, timing: "interpolated" });
expect(ins.words[0].text).toBe("Привет"); expect(ins.revision).toBe(2); expect(ins.parent_revision).toBe(1);
const del = applyTranscriptOps(doc, [{ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000002", text: "Привет" }]);
expect(del.words.map(x => x.id)).toEqual(["w_000001", "w_000003"]); expect(del.removed_word_ids).toEqual(["w_000002"]);
await expect(saveTranscriptRevision(deps, "trn_1", { base_revision: 1, ops })).resolves.toMatchObject({ revision: 2 });
await expect(saveTranscriptRevision(deps, "trn_1", { base_revision: 1, ops })).rejects.toThrow(/revision_conflict/);
// исходная ревизия r1 не тронута: sha256 файла r1 прежний
// EDL: вырезка и её восстановление
const e1 = edlDoc([dec("d1", { status: "proposed", source_start_us: 2_000_000, source_end_us: 3_500_000 })]);
const e2 = applyEdlOps(e1, [{ op: "set_status", decision_id: "d1", status: "accepted" }], words, F30);
expect(buildTimeline(10_000_000, acceptedCuts(e2), F30).duration_us).toBe(8_500_000);
const e3 = applyEdlOps(e2, [{ op: "set_status", decision_id: "d1", status: "rejected" }], words, F30);
expect(buildTimeline(10_000_000, acceptedCuts(e3), F30)).toEqual(buildTimeline(10_000_000, [], F30));   // восстановлено
expect(applyEdlOps(e1, [{ op: "add_cut", start_word_id: "w_000002", end_word_id: "w_000002" }], words /* w2 500–900, w3 с 1_000_000 */, F30).decisions.at(-1))
  .toMatchObject({ origin: "user", status: "accepted", reason: "manual", source_start_us: 500_000, source_end_us: 900_000 });
// approval A
expect(() => approveRoughCut(db, "p1")).toThrow(/proposed_left/);
await saveEdlRevision(deps, "edl_1", { base_revision: 1, ops: acceptAll });
const a = approveRoughCut(db, "p1"); expect(a.subject_ref).toBe("edl:edl_1@r2"); expect(roughCutApprovalValid(db, "p1")).toBe(true);
await saveEdlRevision(deps, "edl_1", { base_revision: 2, ops: [{ op: "set_status", decision_id: "d1", status: "rejected" }] });
expect(roughCutApprovalValid(db, "p1")).toBe(false);
expect(timelineFor(db, "edl_1")).toEqual(buildTimeline(dur, acceptedCuts(currentDoc), F30));
```

- [ ] **Step 2–3:** FAIL → реализовать → PASS. **Step 4:** `./check`; коммит `feat(motion-studio): ревизии транскрипта и EDL, Approval A`.

### Task 28: Черновой монтаж — детекторы, Rough Cut Editor, превью (`roughcut.propose`, `roughcut.preview`)

**Files:**
- Create: `app/motion-studio/server/src/edit/{detect-pauses.ts,detect-fillers.ts,detect-repeats.ts,agent-cuts.ts,merge.ts,preview-filter.ts,sync-probe.ts}`
- Create: `app/motion-studio/server/src/pipeline/{roughcut-propose.ts,roughcut-preview.ts}`; Modify: `app/motion-studio/server/src/jobs/handlers.ts`, `app/motion-studio/server/src/agents/prompts.ts` (`buildRoughCutTask`)
- Create: `app/motion-studio/prompts/{rough-cut-editor.md,partials/evidence-contract.md}`
- Test: `app/motion-studio/server/test/edit/{detect-pauses,detect-fillers,detect-repeats,agent-cuts,merge,preview-filter,sync-probe}.test.ts`, `app/motion-studio/server/test/pipeline/roughcut-propose.test.ts`, `app/motion-studio/server/test/edit/roughcut.e2e.test.ts`

**Interfaces:**
- Consumes: `loadPrompt` (Task 17); `AgentRuntimeAdapter`, `canSpend`-подход (Task 7, 10); `JobHandler` (Task 12); `ArtifactStore`, `edls` repo, `AppConfig.roughcut`, `analysis.maxCostUsd` (Task 24); `runFfmpeg`, `peaksFromPcm`, деривативы `proxy`, `waveform`, `audio16k` (Task 25); `applyEdlOps`, `saveEdlRevision`, `timelineFor` (Task 27); `RoughCutAgentOutputSchema`, `EditDecision`, `verifyQuote`, `buildTimeline`, `sourceToEdited` (Task 23)
- Produces:
  - `detectPauses(words: TranscriptWord[], peaks: Int8Array, cfg: AppConfig["roughcut"], fps: Fps): EditDecision[]` — промежуток `≥ pauseMinUs` → вырезка `[prev.end + keepAfter (после [.?!…] — sentenceKeepAfterUs), next.start − keepBeforeWordUs]`, выравнивание по кадрам; громкость в промежутке > `loudDbfs` дольше 200 мс → не резать (`explanation: "в паузе есть звук"`); `confidence = gap ≥ 1.5 с ? 0.9 : 0.7`
  - `detectFillers(words, cfg, fps): EditDecision[]` — отдельные токены `/^(э+|э-э+|м+|эм+|ам+|мм+)[,.!?…]*$/i` → `[max(prev.end, w.start − fillerPadUs), min(next.start, w.end + fillerPadUs)]`, `confidence 0.85`; «ну», «типа», «вот», «как бы» — только агент
  - `detectRepeats(words, fps): EditDecision[]` — подряд повторённая n-грамма (n = 1…3, по `normalizeToken`) → вырезка первого вхождения `[first.start, second.start]`, `confidence 0.8`
  - `buildRoughCutTask(i: { segments; words: { id; text; start_us; end_us; gap_after_us }[]; detector: EditDecision[] }, run)` — роль `rough_cut_editor`, без инструментов; вход — только id и текст слов, длины пауз; правило в промпте: не удалять осмысленные паузы (после тезиса, перед числом, риторические), только оговорки, фальстарты, неудачные дубли (оставлять последний полный дубль)
  - `agentDecisionToCut(d: RoughCutAgentOutput["decisions"][number], words, cfg, fps): EditDecision | { rejected: string }` — `verifyQuote` (иначе `quote_mismatch`); границы как у `add_cut`; `origin: "agent"`, `status: "proposed"`
  - `mergeProposals(detector: EditDecision[], agent: RoughCutAgentOutput, agentCuts: EditDecision[]): EditDecision[]` — `drop_cut` агента по детектору → `confidence ≤ 0.3` и `agent_note`; пересечения агентских и детекторных вырезок → одна вырезка-объединение с обеими причинами в `explanation`; всё `proposed`
  - `roughcutPropose: JobHandler` — вход `{ projectId; useAgent?: boolean /* true */ }`; транскрипт текущей ревизии + waveform → детекторы → (агент; бюджет `analysis.maxCostUsd`; ответ не прошёл схему — одна переотправка) → ревизия EDL `r1` (или новая поверх текущей: прежние решения пользователя сохраняются, новые — `proposed`) с fencing → A `stale`, если был
  - `buildPreviewFilter(clips: TimelineClip[], fps: Fps, sampleRate: 48000, fadeUs: number): string` — по клипу: `[0:v]trim=start_frame=…:end_frame=…,setpts=PTS-STARTPTS[vi]`, `[0:a]atrim=start_sample=…:end_sample=…,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=…,afade=t=out:st=…:d=…[ai]`; финал `concat=n=<N>:v=1:a=1[v][a]`; источник — CFR-прокси, поэтому индекс кадра точен
  - `roughcutPreview: JobHandler` — вход `{ edlId; revision }` → `-filter_complex_script` → `edits/<edl>/r<N>/preview.mp4` (иммутабельно) → проверка: длительность = `timeline.duration_us` ± 1 кадр
  - `audioOffsetUs(a: Int16Array, b: Int16Array, sampleRate: number, maxLagUs: number): number` — взаимная корреляция; `syncCheck(source16k, preview16k, timeline, words, n = 5): { word_id: string; offset_us: number }[]` — для n слов, равномерно по оставленным, окно ±0.5 с

- [ ] **Step 1: Юнит-тесты (падают):**

```ts
const R = defaults.roughcut, F30 = { num: 30, den: 1 };
expect(detectPauses([w("a", "текст", 0, 1_000_000), w("b", "дальше", 2_600_000, 3_000_000)], quiet, R, F30)[0])
  .toMatchObject({ reason: "pause", source_start_us: 1_100_000, source_end_us: 2_500_000, confidence: 0.9 });
expect(detectPauses([w("a", "текст.", 0, 1_000_000), w("b", "дальше", 2_600_000, 3_000_000)], quiet, R, F30)[0])
  .toMatchObject({ source_start_us: 1_300_000, source_end_us: 2_500_000 });
expect(detectPauses([w("a", "x", 0, 1_000_000), w("b", "y", 1_700_000, 2_000_000)], quiet, R, F30)).toEqual([]);
expect(detectPauses(twoWordsGap1600, loudBetween(1_200_000, 1_600_000), R, F30)).toEqual([]);
expect(detectFillers([w("p", "мы", 0, 1_000_000), w("f", "э-э,", 1_150_000, 1_450_000), w("n", "начали", 1_800_000, 2_200_000)], R, F30)[0])
  .toMatchObject({ reason: "filler", source_start_us: 1_100_000, source_end_us: 1_500_000, confidence: 0.85 });
expect(detectFillers([w("x", "Ну", 0, 200_000), w("y", "давайте", 300_000, 700_000)], R, F30)).toEqual([]);
expect(detectRepeats([w("1", "я", 0, 200_000), w("2", "я", 300_000, 500_000), w("3", "думаю", 600_000, 1_000_000)], F30)[0])
  .toMatchObject({ reason: "repeat", source_start_us: 0, source_end_us: 300_000, start_word_id: "1", end_word_id: "1" });
expect(detectRepeats(ws4("мы сделали мы сделали это"), F30)[0]).toMatchObject({ start_word_id: "w1", end_word_id: "w2" });
expect(agentDecisionToCut({ start_word_id: "w2", end_word_id: "w3", reason: "false_start", confidence: 0.7, explanation: "фальстарт", quote: "совсем другое" }, words, R, F30))
  .toEqual({ rejected: "quote_mismatch" });
const m = mergeProposals([dec("d1", { reason: "pause" })], { decisions: [], reviews: [{ decision_id: "d1", verdict: "drop_cut", why: "пауза перед числом" }] }, []);
expect(m[0]).toMatchObject({ status: "proposed", agent_note: "пауза перед числом" }); expect(m[0].confidence).toBeLessThanOrEqual(0.3);
const f = buildPreviewFilter([{ idx: 0, source_start_us: 0, source_end_us: 2_000_000, edited_start_us: 0 }, { idx: 1, source_start_us: 3_500_000, source_end_us: 5_000_000, edited_start_us: 2_000_000 }], F30, 48000, 8_000);
expect(f).toContain("[0:v]trim=start_frame=0:end_frame=60,setpts=PTS-STARTPTS[v0]");
expect(f).toContain("[0:a]atrim=start_sample=0:end_sample=96000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.008,afade=t=out:st=1.992:d=0.008[a0]");
expect(f).toContain("[0:v]trim=start_frame=105:end_frame=150");
expect(f.endsWith("[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]")).toBe(true);
expect(Math.abs(audioOffsetUs(noise, shift(noise, 480), 16000, 100_000) - 30_000)).toBeLessThanOrEqual(63);
// roughcutPropose: useAgent false → агент не вызывается, EDL r1 только детекторы; бюджет 3 исчерпан → детекторы сохраняются, событие budget
// агентская вырезка с quote_mismatch не попадает в EDL, причина — в событиях задачи
```

- [ ] **Step 2: e2e (`make e2e`):** `talk-ru-cfr.mp4` → импорт → ASR → `roughcut.propose { useAgent: false }` → пауза `[[slnc 2000]]` предложена; принять все → `roughcut.preview` → ffprobe длительность = `timeline.duration_us` ± 1 кадр; `syncCheck` по 5 словам — все `|offset| ≤ 33_334`. Затем `useAgent: true` (реальный `claude`, `sonnet`): ответ проходит схему, все агентские вырезки с проверенной цитатой; стоимость — в отчёт.
- [ ] **Step 3–4:** FAIL → реализовать → PASS. **Step 5:** `./check`; `make e2e`; коммит `feat(motion-studio): черновой монтаж, детекторы и превью`.

### Task 29: Control API и UI Phase 2 — Video Workspace (импорт, транскрипт, rough cut, Approval A)

**Files:**
- Create: `app/motion-studio/server/src/api/routes/{media,transcripts,edls,approvals,video-projects}.ts`, `app/motion-studio/server/src/api/upload.ts`
- Modify: `app/motion-studio/server/src/api/app.ts` (регистрация), `app/motion-studio/server/src/api/routes/projects.ts` (`kind: "video"`)
- Create: `app/motion-studio/web/src/pages/VideoWorkspace.tsx`, `app/motion-studio/web/src/components/video/{MediaImport,MediaInfo,ProxyPlayer,Waveform,ThumbStrip,TranscriptEditor,WordSpan,RevisionList,RoughCutPanel,CutRow,EditedTimelineBar,ApprovalBar,AsrStatus}.tsx`, `app/motion-studio/web/src/video/{use-timeline.ts,word-index.ts}`
- Modify: `app/motion-studio/web/src/{router.ts,i18n/ru.ts,api/client.ts,api/queries.ts}`, `app/motion-studio/web/src/pages/Dashboard.tsx` («Новый видеопроект»)
- Test: `app/motion-studio/server/test/api/{media,upload,transcripts,edls,approvals}.test.ts`, `app/motion-studio/web/test/video/{transcript-editor,rough-cut-panel,edited-timeline,approval-bar,word-index}.test.tsx`, `app/motion-studio/web/e2e/video-phase2.spec.ts`

**Interfaces:**
- Consumes: `buildApp`, `security.ts`, `range.ts`, `sse.ts`, правило `Idempotency-Key` (Task 20); `enqueue`, `requestCancel`, `retryJob` (Task 12–13); repos и `ArtifactStore` (Task 24); `saveTranscriptRevision`, `saveEdlRevision`, `timelineFor`, `approveRoughCut`, `approvalState`, `currentSubject` (Task 24, 27); `resolveImportPath` (Task 25); DTO `api-video.ts`, `sourceToEdited`, `editedToSource`, `mapWords` (Task 23); `t`, `ru`, `api`, `useEvents`, `Player`, `frameToTime`, `timeToFrame`, `JobStatus`, `StorageBanner` (Task 21)
- Produces (`/api`):
  - `POST /projects { title; kind: "video" }` → 201
  - `POST /projects/:id/media/import { path }` → 202 `{ job }` (`media.import`; путь вне `media.importRoots` → 400 `media_invalid`; ассет уже есть → 409 `media_exists`)
  - `PUT /projects/:id/media/upload?name=<file>` — сырое тело потоком в `drafts/upload-<ulid>/`; лимит 64 ГБ; перед приёмом `checkStorage` и `checkImportSpace(Content-Length…)` — нехватка → 507 `low_space`; иначе → 202 `{ job }`
  - `GET /media/:id` (`MediaDto`: probe, деривативы, статус); `GET /media/:id/proxy.mp4` (Range); `GET /media/:id/waveform.bin`; `GET /media/:id/thumbs/:n.jpg` — файлы только по id
  - `POST /media/:id/transcribe { language?; model?; hotwords? }` → 202 (`asr.transcribe`); `GET /asr/capability` → `asrCapability` без путей
  - `GET /transcripts/:id?revision=` → `TranscriptDto` (слова, сегменты, ревизия, `asr`); `GET /transcripts/:id/revisions`; `POST /transcripts/:id/revisions TranscriptRevisionBody` → 201 | 409 (`revision_conflict`, `resource_busy`)
  - `POST /projects/:id/roughcut/propose { useAgent? }` → 202; `GET /edls/:id?revision=` → `EdlDto` (решения, `timeline`, `word_map` = `mapWords`); `POST /edls/:id/revisions EdlRevisionBody` → 201 | 409; `POST /edls/:id/revisions/:n/preview` → 202 (`roughcut.preview`); `GET /edls/:id/revisions/:n/preview.mp4` (Range)
  - `GET /projects/:id/approvals` → `{ A: { state; approval? }, B: … }`; `POST /projects/:id/approvals { kind: "A" }` → 201 | 409 (`proposed_left`); `POST /approvals/:id/revoke` → 200
- Produces (UI, все строки через `t()`):
  - **Video Workspace** (ТЗ §11.1 п.3): шапка проекта и `ApprovalBar` (A/B: «нет», «утверждено», «устарело — причина»); вкладки «Медиа», «Транскрипт», «Черновой монтаж» (Phase 3 добавит «Анализ», «План»)
  - `MediaImport`: путь к файлу или перетаскивание (загрузка с прогрессом); `MediaInfo`: длительность, размеры, fps (`30000/1001` → «29,97»), VFR, поворот, аудио, sha256 (первые 12 символов), путь оригинала «только чтение»
  - `ProxyPlayer` (на `Player` Phase 1): переключатель «Исходник / После монтажа»; в режиме «после монтажа» проигрывается превью ревизии или — пока его нет — прокси с пропуском вырезок по `editedToSource`; `Waveform` + `ThumbStrip` с отметками вырезок; клик → seek
  - `TranscriptEditor`: слова-спаны (клик → seek, текущее слово подсвечено по `currentTime`), правка сегмента в поле ввода → `replace_span`; интерполированные слова — пунктир с подсказкой «время оценено»; вырезанные слова зачёркнуты; `RevisionList` (r1 «ASR, оригинал», rN «правка», сравнение двух ревизий по словам)
  - `RoughCutPanel`: предложения по причинам (`pause`, `filler`, `repeat`, `false_start`, `bad_take`, `manual`) с длительностью, уверенностью, объяснением, заметкой агента; «Принять / Отклонить / Восстановить» по одному и «Принять все высокой уверенности (≥ 0,8)»; «Прослушать фрагмент» (−1 с … +1 с вокруг вырезки); выделение слов в транскрипте → «Вырезать»; итог «было → стало» длительности; кнопка «Собрать превью» и «Утвердить черновой монтаж (A)» — недоступна с подсказкой, пока есть `proposed`
  - `EditedTimelineBar`: две линейки (source и edited) со связями клипов; наведение показывает оба таймкода (`чч:мм:сс.кк` и номер кадра)
  - `use-timeline.ts`: `useEditedTimeline(edlId, revision)`; `word-index.ts`: `wordAt(words, us): number` — бинарный поиск

- [ ] **Step 1: Тесты API (падают),** `app.inject`, `Core` в `tmp/`, обработчики задач — фейковые (контракт API):

```ts
expect((await inj("POST", `/api/projects/${p}/media/import`, ok("k1"), { path: "/etc/hosts" })).statusCode).toBe(400);
const a = await inj("POST", `/api/projects/${p}/media/import`, ok("k2"), { path: fixtureInRoot });
const b = await inj("POST", `/api/projects/${p}/media/import`, ok("k2"), { path: fixtureInRoot });
expect([a.statusCode, b.statusCode]).toEqual([202, 200]);
expect((await inj("POST", `/api/projects/${p}/media/import`, ok("k3"), { path: fixtureInRoot })).statusCode).toBe(409);   // media_exists после импорта
expect((await inj("PUT", `/api/projects/${p2}/media/upload?name=a.mp4`, { ...ok("k4"), "content-length": String(10 ** 15) }, stream)).statusCode).toBe(507);
const r = await inj("GET", `/api/media/${m}/proxy.mp4`, { range: "bytes=0-99" }); expect(r.statusCode).toBe(206);
expect((await inj("POST", `/api/transcripts/${t}/revisions`, ok(), { base_revision: 0, ops })).statusCode).toBe(409);
expect((await inj("POST", `/api/projects/${p}/approvals`, ok(), { kind: "A" })).json()).toMatchObject({ error: "proposed_left" });
// upload: тело пишется потоком в drafts/upload-*/, при обрыве соединения draft удаляется, задача не создаётся
```

- [ ] **Step 2: Тесты UI (падают),** jsdom, фейковый `fetch`:

```ts
for (const f of globSync("web/src/**/*.tsx")) expect(stripImports(readFileSync(f, "utf8"))).not.toMatch(/[А-Яа-яЁё]/);
expect(wordAt(words /* 0–0.4, 0.5–0.9, 1.0–1.2 с */, 600_000)).toBe(1); expect(wordAt(words, 950_000)).toBe(1);
// TranscriptEditor: правка «Привет большой мир» → POST revisions с replace_span и base_revision текущей; 409 → сообщение t("transcript.conflict") и перезагрузка
// RoughCutPanel: «Утвердить (A)» disabled при proposed; tooltip t("approval.a.proposedLeft", { n: 2 })
// RoughCutPanel: «Принять все ≥ 0,8» отправляет set_status только для confidence ≥ 0.8
// EditedTimelineBar: наведение на edited 2.5 с → подписи source «00:00:04.00» и edited «00:00:02.50», кадр 75
// ApprovalBar: state stale reason subject_changed → t("approval.stale.subject_changed")
```

- [ ] **Step 3: Запустить** — FAIL. **Step 4: Реализовать.**
- [ ] **Step 5: Playwright (`make e2e-ui`),** реальный сервер на `tmp`-хранилище, реальные ffmpeg и ASR-воркер, без LLM: новый видеопроект → импорт `talk-ru-cfr.mp4` по пути → прогресс до «готово», данные медиа видны → «Распознать речь» → транскрипт; правка слова → ревизия r2, r1 доступна; «Предложить монтаж» с отключённым агентом → пауза в списке; «Принять» → слово зачёркнуто, длительность «стало» уменьшилась; «Восстановить» → как было; «Принять все» → «Собрать превью» → плеер «После монтажа» играет; «Утвердить (A)» → бейдж «утверждено»; `SIGKILL` сервера и запуск → всё на месте, A валиден; правка статуса вырезки → A «устарело». Скриншоты — `docs/evidence/phase-2/ui/`.
- [ ] **Step 6: Просмотр скриншотов глазами:** подписи на русском, тайм-коды читаемы, ничего не обрезано.
- [ ] **Step 7:** `./check`; коммит `feat(motion-studio): API и UI импорта, транскрипта и чернового монтажа`.

### Task 30: Анализ видеоряда — сцены, ключевые кадры, Apple Vision, Footage Analyst (`footage.analyze`)

**Files:**
- Create: `app/motion-studio/tools/vision-detect/{main.swift,README.md}`; Modify: `app/motion-studio/package.json` (скрипт `build:vision` → `swiftc -O tools/vision-detect/main.swift -o tools/vision-detect/bin/vision-detect`), `app/motion-studio/.gitignore` (`tools/vision-detect/bin/`), `app/motion-studio/server/src/cli/doctor.ts` (наличие и сборка `vision-detect`)
- Create: `app/motion-studio/server/src/analysis/{shots.ts,keyframes.ts,vision.ts,zones.ts,footage-merge.ts}`, `app/motion-studio/server/src/pipeline/footage-analyze.ts`, `app/motion-studio/prompts/footage-analyst.md`; Modify: `app/motion-studio/server/src/jobs/handlers.ts`, `app/motion-studio/server/src/agents/prompts.ts` (`buildFootageTask`)
- Test: `app/motion-studio/server/test/analysis/{shots,keyframes,vision,zones,footage-merge}.test.ts`, `app/motion-studio/server/test/analysis/vision.e2e.test.ts`, `app/motion-studio/server/test/analysis/footage.e2e.test.ts`

**Interfaces:**
- Consumes: `runFfmpeg`, `probeMedia`, дериватив `proxy` (Task 25); `spawnTracked` (Task 2); `JobHandler`, `ArtifactStore`, `createJobDraft`, `footage` repo, `AppConfig.planning.faceMargin` (Task 24); `AgentRuntimeAdapter`, `loadPrompt` (Task 7, 17); `FootageAnalysisSchema`, `FootageAgentOutputSchema`, `NormRect`, `Zone` (Task 23)
- Produces:
  - `vision-detect` (Swift, Vision): `vision-detect <png>…` → stdout JSON `[{ path, width, height, faces: [{ x, y, w, h, confidence }], humans: […], hands: [{ x, y, w, h, confidence }] /* рамка по суставам VNDetectHumanHandPoseRequest */, saliency: […] }]` — координаты Vision как есть (нормированные, начало снизу слева); без сети, только чтение файлов
  - `fromVisionRect(r: NormRect): NormRect` — `y' = 1 − y − h`; `parseVisionOutput(json: unknown): VisionFrame[]` (Zod)
  - `parseScdet(stderr: string): number[]` (`lavfi.scd.time` → µs); `shotsFromCuts(cutsUs: number[], durationUs: number, minShotUs = 1_000_000): { id: string; start_us: number; end_us: number }[]`
  - `sampleKeyframes(shot: { start_us; end_us }, everyUs = 2_000_000, max = 30): number[]` — `start + everyUs/2 + k·everyUs` < `end`; меньше 3 — точки ¼, ½, ¾ шота; общий лимит на ролик 120 (равномерное прореживание)
  - `extractKeyframes(proxy: string, us: number[], outDir: string, o): Promise<string[]>` — точный `-ss` после `-i`, PNG по длинной стороне 640
  - `occupiedRegions(frames: VisionFrame[], o: { faceMargin: 0.25; handMargin: 0.1; minDetectRatio: 0.3 }): { face?: NormRect; hands?: NormRect; faceRatio: number; handsRatio: number; occupied: NormRect[]; uncertain: string[] }` — объединение по кадрам шота, расширение на долю размера, обрезка по кадру
  - `ZONE_RECTS: Record<Zone, NormRect>` (`left_third {0.04,0.08,0.30,0.84}`, `right_third {0.66,0.08,0.30,0.84}`, `top_band {0.04,0.04,0.92,0.22}`, `lower_third {0.04,0.70,0.92,0.24}`, `full {0,0,1,1}`, `split_left {0,0,0.5,1}`, `split_right {0.5,0,0.5,1}`, `pip_* ` — 0.3×0.3 в углах с полем 0.04)
  - `freeZones(occupied: NormRect[], zones: Zone[] = ["left_third","right_third","top_band","lower_third"]): { zone: Zone; rect: NormRect; free_ratio: number }[]` — `1 − area(∪ occupied ∩ zone)/area(zone)`
  - `buildFootageTask(i: { shots: { shot_id; frames: string[] /* относительные пути в draft */; detections: VisionFrame[] }[] }, run)` — роль `footage_analyst`, `tools: ["Read"]`, cwd = draft (`frames/*.png`, `detections.json`, `checklist.md`)
  - `mergeFootage(shots: …, vision: …, agent?: FootageAgentOutput): FootageShot[]` — `occupied` = Vision ∪ `objects.important` агента (агент не может уменьшить занятую область); расхождение позиции автора (Vision vs агент) → `uncertainty` «расхождение детектора и агента»; шот < 3 кадров → `uncertainty` «мало кадров»
  - `footageAnalyze: JobHandler` — вход `{ projectId; mediaId; useAgent?: true }` → `scdet` по прокси → шоты → ключевые кадры → `vision-detect` (нет бинарника → `mode: "llm_only"`, `face.source = "llm"`) → агент (батчи по 24 кадра; бюджет `analysis.maxCostUsd`) → `mergeFootage` → `analysis/footage/<id>/{footage.json,frames/}` с fencing

- [ ] **Step 1: Юнит-тесты (падают):**

```ts
expect(fromVisionRect({ x: 0.5, y: 0.1, w: 0.2, h: 0.3 })).toEqual({ x: 0.5, y: 0.6, w: 0.2, h: 0.3 });
expect(parseScdet("[Parsed_metadata_1 @ 0x1] lavfi.scd.time=12.345\n")).toEqual([12_345_000]);
expect(shotsFromCuts([5_000_000, 5_400_000], 20_000_000).map(s => [s.start_us, s.end_us])).toEqual([[0, 5_000_000], [5_000_000, 20_000_000]]);   // короткий шот слит
expect(sampleKeyframes({ start_us: 0, end_us: 9_000_000 })).toEqual([1_000_000, 3_000_000, 5_000_000, 7_000_000]);
expect(sampleKeyframes({ start_us: 0, end_us: 1_000_000 })).toEqual([250_000, 500_000, 750_000]);
const face = { x: 0.55, y: 0.15, w: 0.25, h: 0.45 };
const z = Object.fromEntries(freeZones([face]).map(f => [f.zone, f.free_ratio]));
expect(z.left_third).toBe(1); expect(z.right_third).toBeCloseTo(0.75, 3); expect(z.top_band).toBeCloseTo(0.864, 3); expect(z.lower_third).toBe(1);
const occ = occupiedRegions(framesWithFace(face, 10), defaults);
expect(occ.face).toEqual({ x: 0.4875, y: 0.0375, w: 0.375, h: 0.675 });   // +25 % размера с каждой стороны
expect(occupiedRegions(framesWithFace(face, 2, { total: 10 }), defaults).uncertain).toContain("лицо найдено менее чем на 30 % кадров");
const merged = mergeFootage(shots1, vision1, { shots: [{ shot_id: "sh_1", author_position: "left", objects: [{ label: "ноутбук", frame_us: 1_000_000, rect: laptop, important: true }], … }] });
expect(merged[0].occupied).toContainEqual(laptop); expect(merged[0].uncertainty).toContain("расхождение детектора и агента");   // Vision: лицо справа
expect(merged[0].occupied).toContainEqual(expect.objectContaining({ x: 0.4875 }));        // лицо не удалено агентом
```

- [ ] **Step 2: e2e (`make e2e`):** `npm run build:vision`; `vision.e2e` — на 10 кадрах ролика `MS_TEST_TALKING_HEAD` (путь к реальному talking-head, по умолчанию выбранный в Task 34 Step 1; без переменной тест падает с понятным сообщением, а не пропускается): лицо найдено на ≥ 8 кадрах, рамка внутри кадра, площадь 1–40 %. `footage.e2e` — `footage.analyze { useAgent: false }` на импортированном ролике: ≥ 1 шот, у каждого ≥ 3 кадров, `face.detected_ratio ≥ 0.8`, `free_zones` содержит зону с `free_ratio ≥ 0.9`; затем `useAgent: true` (реальный `claude`, Read кадров): схема проходит, `author_position` совпадает с Vision или помечено расхождение; стоимость — в отчёт.
- [ ] **Step 3–4:** FAIL → реализовать → PASS. **Step 5: Просмотр глазами** 3 кадров с наложенными рамками лица/рук/зон (`scripts/draw-zones.mjs` — PNG в `docs/evidence/phase-3/footage/`, ≤ 480 px).
- [ ] **Step 6:** `./check`; `make e2e`; коммит `feat(motion-studio): анализ видеоряда и безопасные зоны`.

### Task 31: Семантический анализ — Semantic Director (`semantic.analyze`)

**Files:**
- Create: `app/motion-studio/server/src/analysis/{semantic-input.ts,semantic-validate.ts,semantic-windows.ts}`, `app/motion-studio/server/src/pipeline/semantic-analyze.ts`, `app/motion-studio/prompts/semantic-director.md`
- Modify: `app/motion-studio/server/src/jobs/handlers.ts`, `app/motion-studio/server/src/agents/prompts.ts` (`buildSemanticTask`)
- Test: `app/motion-studio/server/test/analysis/{semantic-input,semantic-validate,semantic-windows}.test.ts`, `app/motion-studio/server/test/pipeline/semantic-analyze.test.ts`, `app/motion-studio/server/test/analysis/semantic.e2e.test.ts`

**Interfaces:**
- Consumes: `roughCutApprovalValid`, `timelineFor` (Task 27); `mapWords`, `verifyQuote`, `SemanticAgentOutputSchema`, `SemanticTimelineSchema` (Task 23); `JobHandler`, `ArtifactStore`, `semantic` repo (Task 24); `AgentRuntimeAdapter`, `loadPrompt` (Task 7, 17); partial `evidence-contract.md` (Task 28)
- Produces:
  - `semanticInput(words: TranscriptWord[], segments, tl: EditedTimeline): { words: { id: string; text: string; edited_s: number }[]; segments: { id: string; word_ids: string[] }[]; removed: number }` — только `kept`/`clipped` слова; время в секундах с 1 знаком — только для ориентира модели, обратно не принимается
  - `windowWords<T>(items: T[], o: { maxWords: 6000; window: 3000; overlap: 300 }): T[][]`
  - `validateSemantic(out: SemanticAgentOutput, words: TranscriptWord[], wordMap: ReturnType<typeof mapWords>): { timeline: Omit<SemanticTimeline, "id" | "transcript_ref" | "edl_ref">; rejected: { kind: string; id?: string; code: "quote_mismatch" | "unknown_word" | "order" | "anchor_in_cut" | "chapter_gap" | "chapter_overlap" }[] }` — цитаты через `verifyQuote`; слово `removed` внутри диапазона → `anchor_in_cut`; главы покрывают все оставленные слова без пересечений; `emphasis_word_ids` ⊆ диапазона якоря
  - `buildSemanticTask(i: ReturnType<typeof semanticInput>, run)` — роль `semantic_director`, без инструментов; промпт: главы, тезисы, сложные концепции, числа, причинно-следственные связи, сущности, смысловые якоря и акценты; `claim_type` различает факт/предположение/мнение; спорное — в `disputed`; цитаты дословно; никаких времён
  - `semanticAnalyze: JobHandler` — вход `{ projectId }`; без валидного A → `failed(approval_required)`; окна → агент → `validateSemantic`; если `rejected` не пуст — одна переотправка с перечнем ошибок (в лимите `maxAutoFixes`); оставшиеся отклонённые — в `semantic.json.rejected` и событиях; публикация `analysis/semantic/<id>/semantic.json` (`transcript_ref`, `edl_ref` — ревизии, на которых построено) с fencing

- [ ] **Step 1: Тесты (падают),** фейковый агент — только логика:

```ts
const tl = buildTimeline(10_000_000, [{ start_us: 2_000_000, end_us: 3_500_000 }], F30);
const inp = semanticInput(words10 /* w1..w10 по 1 с, w3 2.0–2.9 с вырезано */, segs, tl);
expect(inp.words.map(x => x.id)).not.toContain("w3"); expect(inp.removed).toBe(1);
expect(windowWords(range(7000), { maxWords: 6000, window: 3000, overlap: 300 }).map(w => [w[0], w.at(-1)])).toEqual([[0, 2999], [2700, 5699], [5400, 6999]]);
expect(windowWords(range(500), defaults)).toHaveLength(1);
const v = validateSemantic(out({ anchors: [anchor("a1", "w2", "w4", "текст w2 w3 w4")] }), words10, mapWords(tl, words10));
expect(v.rejected).toContainEqual({ kind: "anchor", id: "a1", code: "anchor_in_cut" });
expect(validateSemantic(out({ anchors: [anchor("a2", "w5", "w6", "не то")] }), words10, map).rejected[0].code).toBe("quote_mismatch");
expect(validateSemantic(out({ chapters: [ch("c1", "w1", "w5")] }), words10, map).rejected).toContainEqual(expect.objectContaining({ code: "chapter_gap" }));
// semanticAnalyze: A не утверждён → failed approval_required, агент не вызван
// первый ответ с quote_mismatch → вторая отправка с перечнем; второй чистый → semantic.json без rejected
```

- [ ] **Step 2: e2e (`make e2e`):** проект из Task 28 e2e (`talk-ru-cfr.mp4`, A утверждён) → `semantic.analyze` (реальный `claude`, `sonnet`): `completed`; ≥ 1 глава; ≥ 1 якорь `number` с цитатой, содержащей «тысяч» или «000»; все цитаты проходят `verifyQuote`; `rejected` пуст или каждая запись с кодом; стоимость — в отчёт.
- [ ] **Step 3–4:** FAIL → реализовать → PASS. **Step 5:** `./check`; `make e2e`; коммит `feat(motion-studio): семантический анализ транскрипта`.

### Task 32: Visual Planner, StyleBible проекта, проверки плана, ревизии и Approval B (`plan.visual`, `plan.recheck`)

**Files:**
- Create: `app/motion-studio/server/src/analysis/{planner-input.ts,plan-build.ts,plan-checks.ts,plan-ops.ts,plan-recheck.ts,project-style.ts,approval-b.ts}`
- Create: `app/motion-studio/server/src/pipeline/{plan-visual.ts,plan-recheck.ts}`, `app/motion-studio/prompts/visual-planner.md`
- Modify: `app/motion-studio/server/src/jobs/handlers.ts`, `app/motion-studio/server/src/agents/prompts.ts` (`buildVisualPlannerTask`), `app/motion-studio/server/src/edit/edl-ops.ts` (после новой ревизии EDL — `enqueue("plan.recheck")`, если план есть)
- Test: `app/motion-studio/server/test/analysis/{planner-input,plan-build,plan-checks,plan-ops,plan-recheck,project-style,approval-b}.test.ts`, `app/motion-studio/server/test/pipeline/plan-visual.test.ts`, `app/motion-studio/server/test/analysis/plan.e2e.test.ts`

**Interfaces:**
- Consumes: `rangeFromWords`, `mapWords`, `verifyQuote`, `VisualPlannerOutputSchema`, `ScenePlanItem`, `PlanIssue`, `PlanOp`, `VisualPlanRevisionDoc`, `ProjectStyleDoc`, `canonicalHash` (Task 23); `ZONE_RECTS`, `FootageAnalysis` (Task 30); `SemanticTimeline` (Task 31); `roughCutApprovalValid`, `timelineFor` (Task 27); `approve`, `approvalState`, `cascadeStale`, `currentSubject`, `ArtifactStore`, repos `plans`, `styles`, `AppConfig.planning` (Task 24); `resolveStyle`, `contrastRatio`, `presets` (Task 6, 14); `PATTERN_SLUGS` (Task 11); `KnowledgeAdapter.getVisualPatterns` (Task 8) — однострочные описания 12 паттернов
- Produces:
  - `plannerInput(sem: SemanticTimeline, footage: FootageAnalysis, tl, words, style: ResolvedStyle): { anchors: { id; kind; quote; start_word_id; end_word_id; edited_s: [number, number]; importance; claim_type }[]; footage_at_anchor: Record<string, { face_zone: "left" | "center" | "right" | "absent"; free_zones: { zone: Zone; free_ratio: number }[] }>; patterns: { slug; summary }[]; budget: { max_coverage; edited_duration_s } }`
  - `occupiedAt(footage, source: { start_us; end_us }): NormRect[]` — объединение `occupied` шотов, пересекающих диапазон
  - `buildPlanItems(out: VisualPlannerOutput, ctx: { words; tl; footage; styleId; cfg: AppConfig["planning"] }): { items: ScenePlanItem[]; skipped; rejected: { opp_id; code }[] }` — для `decision = "plan"`: `verifyQuote` каждой `evidence` (иначе `quote_mismatch`), слова не вырезаны (`anchor_in_cut`), `rangeFromWords(… padPreUs, padPostUs)` → `edited`, `source`, `frames`; `rect = ZONE_RECTS[zone]`; `face_overlap.ratio = area(rect ∩ face)/area(face)`, где `face` — `face.union` шотов из `occupiedAt` (уже расширенная на `faceMargin`; в тестах фикстура задаёт её напрямую); `key_terms[].edited_at_us` — начало слова; `segment_ids` — по словам
  - `planChecks(items: ScenePlanItem[], ctx: { editedDurationUs; cfg }): PlanIssue[]` — `face_overlap` (blocking): `composition_mode ∈ {overlay, callout, pip}` и `ratio > faceOverlapMax` без `override_reason` (с причиной — warning); `scene_overlap` (blocking): пересечение edited-диапазонов принятых/предложенных сцен; `density` (blocking): сумма длительностей / длительность > `maxCoverage`; `fullscreen_heavy` (warning): fullscreen + split > `maxFullscreenCoverage`; `tight_gap` (warning): промежуток < `minGapUs`; `too_short` / `too_long` (warning): вне `[minSceneUs, maxSceneUs]`; `key_term_outside` (blocking): слово `key_terms` вне диапазона сцены
  - `projectStyleFrom(base: ProjectStyleDoc["base"]): { resolved: StyleBible; issues: PlanIssue[] }` — `resolveStyle`; `contrastRatio(text, bg) < 7` или `muted < 4.5` → blocking `style_contrast`; `saveProjectStyle(deps, projectId, base, author): Promise<ProjectStyleDoc>` — новая ревизия `style/<id>/r<N>`; при валидном B → `cascadeStale("style")`
  - `buildVisualPlannerTask(i: ReturnType<typeof plannerInput>, run)` — роль `visual_planner`, без инструментов; промпт: визуализировать смысл, а не украшать (ТЗ §1.1); `skip` с причиной — нормальное решение; режим из шести; не закрывать лицо, руки и важные объекты, fullscreen — только когда автор не визуальный центр; одна мысль на сцену; ключевые слова и числа появляются в момент произнесения; оценки полезности/трудоёмкости/нагрузки; StyleBible проекта (пресет, палитра, шрифт, интенсивность, глубина) с обоснованием по теме ролика
  - `applyPlanOps(doc: VisualPlanRevisionDoc, ops: PlanOp[], ctx): VisualPlanRevisionDoc` — новая ревизия; `modify` слов пересчитывает времена; `add` — `origin: "user"`, `status: "accepted"`; после — `planChecks`; `savePlanRevision(deps, planId, { base_revision, ops })` (409 `revision_conflict` / `resource_busy`)
  - `recheckPlan(doc: VisualPlanRevisionDoc, newTl: EditedTimeline, words, footage, cfg): { doc: VisualPlanRevisionDoc; changed: { item_id: string; change: "remapped" | "anchor_cut" | "timing_changed" }[] }` — слова якоря или `evidence` вырезаны → `stale(anchor_cut)`; длительность изменилась > 20 % → `stale(timing_changed)`; иначе — новые `edited`/`frames`, статус прежний; `inputs.edl` — новая ревизия
  - `approveVisualPlan(db, projectId): Approval` — ошибки: `approval_required` (A не валиден), `plan_outdated` (`inputs.edl.revision ≠` утверждённой в A или стиль не текущий), `items_unresolved` (есть `proposed`/`stale`), `blocking_issues`; иначе `approve("B", "plan:<id>@r<N>", canonicalHash(doc))`
  - `planVisual: JobHandler` — вход `{ projectId }`; гейт A → нужны текущие `semantic` (на тех же ревизиях транскрипта и EDL) и `footage`, иначе `failed` с перечнем недостающего → `plannerInput` → агент → `buildPlanItems` + `planChecks`; blocking по вине агента (`face_overlap` без причины, `scene_overlap`, `density`, `quote_mismatch`) → одна-две отправки на исправление (`maxAutoFixes`); остаток — сцены `proposed` с проблемами, видимыми человеку → `saveProjectStyle(author: "agent")` (если стиль ещё не задан пользователем) → ревизия плана `r1` с fencing
  - `planRecheck: JobHandler` — вход `{ projectId }`, без LLM → `recheckPlan` → новая ревизия; B — `stale` (через смену субъекта)

- [ ] **Step 1: Тесты (падают):**

```ts
const P = defaults.planning, face = { x: 0.55, y: 0.15, w: 0.25, h: 0.45 };
const items = buildPlanItems(out([opp({ start_word_id: "w5", end_word_id: "w9", zone: "right_third", composition_mode: "overlay", evidence: [ev("w5", "w9", quote59)] })]), ctx(tl, face)).items;
expect(items[0]).toMatchObject({ edited: { start_us: 2_300_000, end_us: 4_800_000 }, source: { start_us: 3_800_000, end_us: 6_300_000 }, frames: { start: 69, end: 144 } });
expect(items[0].face_overlap.ratio).toBeCloseTo(0.56, 2);
expect(planChecks(items, { editedDurationUs: 60_000_000, cfg: P })).toContainEqual(expect.objectContaining({ code: "face_overlap", severity: "blocking" }));
expect(planChecks([{ ...items[0], face_overlap: { ratio: 0.56, override_reason: "показываем предмет в руке автора" } }], c60).find(i => i.code === "face_overlap")!.severity).toBe("warning");
expect(planChecks([{ ...items[0], zone: "left_third", rect: ZONE_RECTS.left_third, face_overlap: { ratio: 0 } }], c60).filter(i => i.severity === "blocking")).toEqual([]);
expect(planChecks([sc(0, 10e6), sc(12e6, 20e6), sc(30e6, 39e6)], c60)).toContainEqual(expect.objectContaining({ code: "density", severity: "blocking" }));   // 27/60 = 0.45 > 0.4
expect(planChecks([sc(10e6, 20e6), sc(21e6, 25e6)], c60)).toContainEqual(expect.objectContaining({ code: "tight_gap" }));
expect(planChecks([sc(10e6, 20e6), sc(19e6, 25e6)], c60)).toContainEqual(expect.objectContaining({ code: "scene_overlap", severity: "blocking" }));
expect(buildPlanItems(out([opp({ evidence: [ev("w5", "w6", "выдуманная цитата")] })]), ctx(tl, face)).rejected[0].code).toBe("quote_mismatch");
expect(buildPlanItems(out([opp({ start_word_id: "w3", end_word_id: "w4" /* w3 вырезано */ })]), ctx(tl, face)).rejected[0].code).toBe("anchor_in_cut");
expect(projectStyleFrom({ preset: "dark-premium", intensity: "balanced", depth: 1, palette_overrides: { text: "#333333" } }).issues[0].code).toBe("style_contrast");
// recheck
const re = recheckPlan(planDoc([itemOn("w5", "w9"), itemOn("w12", "w14")]), tlCutting("w13"), words, footage, P);
expect(re.changed).toEqual([{ item_id: "sp_001", change: "remapped" }, { item_id: "sp_002", change: "anchor_cut" }]);
expect(re.doc.items[1]).toMatchObject({ status: "stale", stale_reason: "anchor_cut" });
// approval B
expect(() => approveVisualPlan(db, "p1")).toThrow(/items_unresolved/);
await savePlanRevision(deps, "pln_1", { base_revision: 1, ops: resolveAll });
const b = approveVisualPlan(db, "p1"); expect(b.subject_ref).toBe("plan:pln_1@r2");
await saveEdlRevision(deps, "edl_1", { base_revision: 2, ops: [rejectOne] });
expect(approvalState(db, "p1", "B", currentSubject(db, "p1", "B")).state).toBe("stale");     // upstream_A
await saveProjectStyle(deps, "p1", { ...base, intensity: "calm" }, "user");   // после переутверждения A и B
expect(approvalState(db, "p1", "B", currentSubject(db, "p1", "B"))).toMatchObject({ state: "stale", reason: "style_changed" });
// planVisual: агент дважды ставит overlay на лицо без причины → после лимита сцена proposed с blocking face_overlap; B не утверждается
// planVisual: semantic построен на старой ревизии EDL → failed с перечнем «semantic устарел»
```

- [ ] **Step 2: e2e (`make e2e`):** проект из Task 31 e2e + `footage.analyze` → `plan.visual` (реальный `claude`): `completed`; ≥ 1 сцена или явные `skipped` с причинами; у каждой сцены ≥ 1 `evidence`, проходящая `verifyQuote`; `frames.start = usToFrame(edited.start_us)`; нет blocking `face_overlap` без `override_reason`; StyleBible проекта проходит контраст; затем EDL меняется → `plan.recheck` → B `stale`. Стоимость — в отчёт.
- [ ] **Step 3–4:** FAIL → реализовать → PASS. **Step 5:** `./check`; `make e2e`; коммит `feat(motion-studio): визуальный план, StyleBible проекта и Approval B`.

### Task 33: Control API и UI Phase 3 — анализ, главы, план на таймлайне, StyleBible, Approval B

**Files:**
- Create: `app/motion-studio/server/src/api/routes/{footage,semantic,plans,project-style}.ts`; Modify: `app/motion-studio/server/src/api/{app.ts,routes/approvals.ts}` (`kind: "B"`)
- Create: `app/motion-studio/web/src/components/video/{AnalysisPanel,ShotList,SafeZoneOverlay,ChaptersPanel,AnchorList,PlanTrack,PlanInspector,EvidenceQuote,PlanIssues,AddSceneDialog,StyleBiblePanel,StaleBanner}.tsx`, `app/motion-studio/web/src/video/{plan-layout.ts,zone-geometry.ts}`
- Modify: `app/motion-studio/web/src/pages/VideoWorkspace.tsx` (вкладки «Анализ» и «План»), `app/motion-studio/web/src/i18n/ru.ts`, `app/motion-studio/web/src/api/{client.ts,queries.ts}`
- Test: `app/motion-studio/server/test/api/{footage,semantic,plans,project-style}.test.ts`, `app/motion-studio/web/test/video/{plan-track,plan-inspector,safe-zone-overlay,evidence-quote,style-bible-panel,stale-banner,plan-layout}.test.tsx`, `app/motion-studio/web/e2e/video-phase3.spec.ts`

**Interfaces:**
- Consumes: всё API-окружение Task 20 и Task 29; `approveVisualPlan`, `savePlanRevision`, `saveProjectStyle`, `planChecks` (Task 32); `footage`, `semantic`, `plans`, `styles` repos (Task 24); `ZONE_RECTS` (Task 30); DTO `api-video.ts`, `editedToSource`, `usToFrame` (Task 23); UI Phase 2 (Task 29); `ComponentsPanel`-подобные бейджи и `Player` (Task 21)
- Produces (`/api`):
  - `POST /projects/:id/footage/analyze { useAgent? }` → 202; `GET /footage/:id` → `FootageDto`; `GET /footage/:id/frames/:n.png`
  - `POST /projects/:id/semantic/analyze` → 202 | 409 `approval_required`; `GET /semantic/:id`
  - `POST /projects/:id/plan/generate` → 202 | 409 (`approval_required`, `semantic_missing`, `footage_missing`); `GET /plans/:id?revision=` → `PlanDto` (сцены, `skipped`, `issues`, `inputs`, свежесть входов); `POST /plans/:id/revisions PlanRevisionBody` → 201 | 409; `POST /plans/:id/recheck` → 202
  - `GET /projects/:id/style` → `ProjectStyleDto` (текущая ревизия, история); `PUT /projects/:id/style { base }` → 201 | 400 (`style_contrast` с парами цветов)
  - `POST /projects/:id/approvals { kind: "B" }` → 201 | 409 (`approval_required`, `plan_outdated`, `items_unresolved`, `blocking_issues` с перечнем)
- Produces (UI):
  - **Вкладка «Анализ»:** `ShotList` (шоты, миниатюры ключевых кадров, позиция автора, движение, неопределённость), `SafeZoneOverlay` поверх плеера (рамки лица/рук, свободные зоны с процентом), режим `llm_only` — предупреждение «зоны оценены без детектора»; `ChaptersPanel` (главы с переходом по клику), `AnchorList` (тезисы, числа, акценты; `claim_type` бейджем «факт / предположение / мнение»; спорные места — отдельным списком)
  - **Вкладка «План»:** `PlanTrack` — дорожка сцен под `EditedTimelineBar` (цвет по `composition_mode`, штриховка `proposed`, красная рамка `stale`/blocking; пропуски `skipped` — тонкие отметки с причиной по наведению); `PlanInspector` — назначение, тип визуализации (паттерн KB), режим, зона (выбор с превью на кадре), ключевые слова с моментом появления, метафора, сложность/полезность/трудоёмкость/нагрузка, `EvidenceQuote` (цитата, edited- и source-таймкоды, кадры; клик → seek и проигрывание фрагмента), перекрытие лица в процентах и поле «причина» (обязательное, если перекрытие > 2 %), проблемы `PlanIssues`; действия «Принять / Отклонить / Изменить / Вернуть к предложению»; `AddSceneDialog` — выделить слова в транскрипте → «Добавить сцену» (тип, режим, зона, назначение)
  - `StyleBiblePanel`: пресет, палитра (свотчи с контрастом), шрифты (образец кириллицы), интенсивность, глубина, обоснование Art Director; сохранение → новая ревизия; предупреждение, что B станет «устаревшим»
  - `StaleBanner`: «Монтаж изменился: N сцен пересчитаны, M требуют решения» со списком и кнопкой «Перепроверить план»; «Утвердить визуальный план (B)» — с перечнем причин, если недоступно
  - `plan-layout.ts`: `trackLayout(items, durationUs, widthPx): { id; left: number; width: number; lane: number }[]` — без наложений по дорожкам; `zone-geometry.ts`: `rectToCss(rect, videoBox)`

- [ ] **Step 1: Тесты API (падают):** `plan/generate` без A → 409 `approval_required`; `POST /plans/:id/revisions` с `modify` зоны на лицо без `override_reason` → 201 и `issues` содержит blocking `face_overlap`; `POST approvals B` → 409 `blocking_issues`; с причиной → warning, B → 201; `PUT style` с `text: "#333333"` → 400 `style_contrast`; после `PUT style` валидный → `GET approvals` → B `stale(style_changed)`; `GET /footage/:id/frames/..%2F..%2Fstudio.db.png` → 404.
- [ ] **Step 2: Тесты UI (падают):**

```ts
expect(trackLayout([it(0, 5e6), it(4e6, 8e6), it(9e6, 10e6)], 10e6, 1000)).toEqual([
  { id: "a", left: 0, width: 500, lane: 0 }, { id: "b", left: 400, width: 400, lane: 1 }, { id: "c", left: 900, width: 100, lane: 0 }]);
expect(rectToCss({ x: 0.66, y: 0.08, w: 0.3, h: 0.84 }, { left: 0, top: 0, width: 1280, height: 720 })).toEqual({ left: 844.8, top: 57.6, width: 384, height: 604.8 });
// PlanInspector: face_overlap 0.56 → поле «причина» обязательно, «Принять» disabled без текста
// EvidenceQuote: клик → seek(edited.start_us) и пауза на edited.end_us; подписи source/edited/кадр
// AnchorList: claim_type assumption → бейдж t("semantic.claim.assumption")
// StaleBanner: changed anchor_cut 1, remapped 2 → t("plan.stale.summary", { remapped: 2, needs: 1 })
// кириллица в .tsx вне словаря отсутствует (тест Task 21 покрывает новые файлы)
```

- [ ] **Step 3: Запустить** — FAIL. **Step 4: Реализовать.**
- [ ] **Step 5: Playwright (`make e2e-ui`),** без LLM: проект из `video-phase2.spec` (A утверждён) → «Анализировать видеоряд» с отключённым агентом → шоты и рамки видны на кадре; план из сцен, добавленных пользователем (`AddSceneDialog` по выделенным словам; семантика и Visual Planner с LLM — только в приёмке Task 34). У `talk-ru-cfr.mp4` нет лица, поэтому этот spec импортирует реальный ролик из `MS_TEST_TALKING_HEAD` (импорт, ASR и Vision реальные): сцена в зоне над лицом → blocking «перекрытие лица» → смена зоны на `left_third` → проблема исчезла → «Утвердить (B)» → «утверждено»; изменение StyleBible → B «устарело»; отклонение вырезки в «Черновом монтаже» → A и B «устарели», баннер «Монтаж изменился» → «Перепроверить план» → сцены пересчитаны. Скриншоты — `docs/evidence/phase-3/ui/` (кадры ≤ 480 px).
- [ ] **Step 6: Просмотр скриншотов глазами;** **Step 7:** `./check`; коммит `feat(motion-studio): API и UI анализа и визуального плана`.

### Task 34: Приёмка Phase 2–3 на реальном talking-head ролике

**Files:**
- Create: `app/motion-studio/web/e2e/acceptance-video/{global-setup.ts,helpers.ts,phase2-import-asr.spec.ts,phase2-roughcut.spec.ts,phase2-restart.spec.ts,phase2-resilience.spec.ts,phase3-analysis.spec.ts,phase3-plan.spec.ts,phase3-recheck.spec.ts}`, `app/motion-studio/web/playwright.acceptance-video.config.ts`
- Create: `app/motion-studio/scripts/{pick-test-video.mjs,collect-video-evidence.mjs,draw-zones.mjs,timing-audit.mjs}`
- Create: `docs/evidence/phase-2/{import,asr,transcript-edit,roughcut,restart,resilience}/…`, `docs/evidence/phase-2/REPORT.md`, `docs/evidence/phase-3/{footage,semantic,plan,approval-b,recheck}/…`, `docs/evidence/phase-3/REPORT.md`
- Modify: `app/motion-studio/Makefile` (`acceptance-video`), `app/motion-studio/README.md` (запуск, время, стоимость)

**Interfaces:**
- Consumes: всё из Task 1–33
- Produces:
  - `pick-test-video.mjs` — ffprobe кандидатов по порядку: `/Volumes/External SSD/Youtube/FinalVideo/MyProtocol/MyProtocol-shorts_{1..11}.mov`; критерии: длительность 45–150 с, есть аудио, доля речи по `silencedetect -35dB:d=0.4` ≥ 50 %; печатает выбранный путь, ffprobe и sha256 (выбор — в `REPORT.md`); если ни один не подошёл — остановка с отчётом, человек называет ролик. Длинный стресс-кандидат — `/Volumes/External SSD/Youtube/FinalVideo/MyProtocol/MyProtocol.mov` (≈ 10 ГБ): только импорт (APFS-клон на том же томе) и ASR с разрезами по тишине, без Phase 3
  - `global-setup.ts`: `MS_DATA_DIR="/Volumes/External SSD/MotionStudio-acceptance"` (стор приёмки Phase 1; `doctor --init`, если нет); `npm run doctor` (включая ASR и `vision-detect`) обязан пройти; sha256 выбранного ролика `before`; `npm start`
  - `timing-audit.mjs <projectId>` — для 10 слов, равномерно по оставленным: `source_us`, `edited_us` (`sourceToEdited`), обратное отображение, `audioOffsetUs` между окном исходного `audio16k` и окном аудио превью rough cut; таблица в `phase-2/roughcut/timing-audit.md`
  - `collect-video-evidence.mjs <projectId> <dest>`: `media-manifest.json`, ffprobe исходника и прокси, `transcript r1/rN` (JSON), diff ревизий, `edl rN` + `timeline`, кадры (≤ 480 px), `footage.json`, `semantic.json`, `plan rN` + `issues`, StyleBible, approvals, журналы задач, `agent_runs` (модель, стоимость, токены); видео — только sha256, ffprobe и путь
  - `REPORT.md` (по фазам): таблица пунктов приёмки ТЗ §13 → [A] pass/fail со ссылкой на evidence или [H] с результатом просмотра; стоимость и время по шагам; известные ограничения; что требует утверждения (ТЗ §16 п.8)

- [ ] **Step 1: Выбор ролика и согласие (V4).** `node scripts/pick-test-video.mjs` → путь, длительность, ориентация; человек подтверждает использование своих материалов; без подтверждения — стоп.
- [ ] **Step 2: Phase 2 — импорт и ASR (`phase2-import-asr.spec`), через UI:** новый видеопроект «Приёмка видео» → импорт по пути → `completed`; [A] sha256 исходника до/после равен, копия `0444`, на том же томе `cloned: true`; ffprobe прокси: CFR, `timeline_fps` проекта, длительность ± 1 кадр; waveform и миниатюры есть → «Распознать речь» (ru) → [A] `asr.worker_sha256` = ожидаемому, слова монотонны, длительность ± 0,1 с, `confidence: null`; [H] 3 случайных сегмента: текст соответствует речи (человек слушает).
- [ ] **Step 3: Правка транскрипта:** исправить 2 слова и вставить слово → r2; [A] id остальных слов и их таймкоды не изменились, r1 открывается и не изменён (sha256), вставленное слово `interpolated`.
- [ ] **Step 4: Rough cut (`phase2-roughcut.spec`):** «Предложить монтаж» с агентом (реальный `claude`) → [A] у каждой вырезки причина, интервал, уверенность, объяснение; агентские — с проверенной цитатой; принять часть, одну отклонить, одну принятую «Восстановить» → [A] таймлайн равен построенному без неё; «Собрать превью» → [A] длительность превью = `timeline.duration_us` ± 1 кадр; `timing-audit.mjs`: 10 слов — обратное отображение без потерь, `|audioOffset| ≤ 33 334 µs` (1 кадр при 30 fps; для `timeline_fps` проекта — один его кадр); [H] прослушать 3 стыка: нет щелчков и обрезанных слов → «Утвердить (A)».
- [ ] **Step 5: Перезапуск (`phase2-restart.spec`):** `SIGKILL` сервера → старт → проект, ревизии транскрипта и EDL, превью, A — на месте, sha256 артефактов прежние; [A] оригинал не изменён.
- [ ] **Step 6: Устойчивость (`phase2-resilience.spec`):** (1) `SIGKILL` во время ASR → воркер мёртв (группа), задача `pending` → `completed`; (2) повторный POST импорта с тем же `Idempotency-Key` → тот же `job.id`; (3) `MS_DATA_DIR` переименован во время построения прокси → баннер, 503, в исходном пути ничего не создано, после возврата — задача доведена; (4) импорт файла вне `importRoots` → понятная ошибка; (5) длинный исходник `MyProtocol.mov`: импорт клоном, ASR с `splits` (> 300 с), [A] слова покрывают длительность, время и стоимость в отчёт (если ASR дольше 60 мин — шаг [H] с пометкой, не блокирует приёмку).
- [ ] **Step 7: Phase 3 — анализ (`phase3-analysis.spec`):** «Анализировать видеоряд» (Vision + агент) → [A] у каждого шота ≥ 3 кадров, лицо найдено на ≥ 80 % кадров, есть свободная зона `free_ratio ≥ 0.9`; «Семантический анализ» → [A] все цитаты проходят `verifyQuote`, якоря не в вырезках, главы покрывают ролик; [H] главы и тезисы осмысленны, факты отделены от предположений; кадры с наложенными зонами — `phase-3/footage/`.
- [ ] **Step 8: Phase 3 — план (`phase3-plan.spec`):** «Сгенерировать план» → [A] у каждой сцены ≥ 1 цитата с id слов, `edited`/`source`/`frames` согласованы (`frames.start = usToFrame(edited.start_us, timeline_fps)`, `editedToSource(edited.start_us) = source.start_us`); есть хотя бы одно решение `skip` с причиной или обоснование, почему графика везде нужна; нет overlay/callout/pip поверх лица без `override_reason`; покрытие ≤ 40 %; хотя бы одна сцена с числом из речи (если в ролике есть число); StyleBible проекта проходит контраст; [H] «точные таймкоды»: проиграть 5 сцен в контексте превью rough cut — ключевое слово звучит внутри диапазона сцены; полезность предложений (человек отмечает «полезно / лишнее» по каждой сцене — доля «полезно» в отчёт). Затем через UI: изменить режим одной сцены, отклонить одну, добавить свою по выделенным словам, поправить StyleBible → «Утвердить (B)».
- [ ] **Step 9: Перепроверка (`phase3-recheck.spec`):** в «Черновом монтаже» вырезать слова, на которых стоит одна сцена → A и B `stale`; переутвердить A → «Перепроверить план» → [A] эта сцена `stale(anchor_cut)`, остальные `remapped` с новыми edited-временами без вызова LLM (`agent_runs` не прибавились); решить сцену → B снова утверждается; сборки из устаревшего плана нет (B `stale` до решения).
- [ ] **Step 10: Просмотр глазами [H]:** ключевые кадры с зонами и раскладкой сцен плана — графика не закрывает лицо и руки; замечания по кадру и сцене — в `REPORT.md`; ничего не подгонять под тест.
- [ ] **Step 11:** `./check`; коммит `test(motion-studio): приёмка Phase 2–3 и evidence`; итог человеку по ТЗ §16 п.8: реализовано, тесты, ограничения (VFR → CFR прокси, `confidence` слов отсутствует, Vision только на macOS, длинные ролики > 6000 слов — оконный семантический анализ), стоимость прогонов, что утвердить.

---

## Self-review (выполнен)

- **ТЗ §13 Phase 2:** импорт и неизменяемый оригинал (Task 25), прокси/waveform/ffprobe (Task 25), реальный ASR (Task 26), редактирование транскрипта с сохранением исходной и исправленной версий (Task 27), EDL и source↔edited (Task 23, 27), Approval A (Task 27, 29), rough-cut preview (Task 28). Приёмка: исходник не меняется, вырезки возвращаются, таймкоды верны, перезапуск — Task 34 Step 2–6.
- **ТЗ §13 Phase 3:** семантика (Task 31), Footage Analyzer и безопасные зоны (Task 30), StyleBible проекта (Task 32), предложения сцен и режимы композиции (Task 32), Approval B (Task 32, 33). Приёмка: обоснованные сцены с точными таймкодами, правка и утверждение, без графики поверх лица без причины — Task 34 Step 7–10.
- **ТЗ §5 A1–A5 детали:** проверка места (Task 25), VFR и поворот (Task 25), сегменты строим сами и честно без confidence (Task 26, V10), паузы с сохранением осмысленных, оговорки, повторы, дубли с причиной/интервалом/уверенностью (Task 28), выводы на edited timeline и пометка неопределённости (Task 30, 31), «нет графики» как решение (Task 32), ключевые слова в момент произнесения (Task 32 `key_terms.edited_at_us`), оценки полезности/трудоёмкости/нагрузки (Task 32).
- **ТЗ §7.1:** µs, рациональный FPS, VFR, якоря на id слов, изменение EDL инвалидирует затронутые привязки и перепроверяет без перегенерации (Task 23, 32 `recheckPlan`).
- **ТЗ §11.2:** сброс зависимых approvals (Task 24 `cascadeStale`, Task 27, 32; V5).
- **ADR 0006/0007:** все долгие операции — задачи с draft на попытку, fencing (`ArtifactStore.publish`), группами процессов (ffmpeg, ASR-воркер, `vision-detect`, `claude`), восстановлением и `blocked`; StorageGuard перед импортом и в ходе (Task 24–26, 34). Замки ресурсов проекта — расширение замка сцены (V8).
- **Объяснимость:** каждая вырезка агента, якорь и сцена — с дословной цитатой и id слов, проверенными кодом; времена считает код (Task 23 `verifyQuote`, `rangeFromWords`; Task 28, 31, 32).
- **Интерфейсы Phase 1 потребляются по точным именам:** `checkStorage`, `safeMkdir`, `spawnTracked`, `ProcessRegistry`, `SqliteProcessRegistry`, `bootCore`, `Core`, `enqueue`, `claimNext`, `finish`, `fenceOk`, `requestCancel`, `retryJob`, `JobHandler`, `JobContext`, `Semaphore`, `registerHandlers`, `openDb`, `migrate`, `Draft`, `quarantineDraft`, `newId`, `AgentRuntimeAdapter`, `childEnv`, `loadConfig`, `AppConfig`, `Role`, `loadPrompt`, `KnowledgeAdapter.getVisualPatterns`, `resolveStyle`, `contrastRatio`, `presets`, `PATTERN_SLUGS`, `usToFrame`, `frameToUs`, `toJsonSchema`, `buildApp`, `t`, `Player`, `frameToTime`, `timeToFrame`, `useEvents`, `JobStatus`, `StorageBanner`. Расширения сигнатур (обратно совместимые): `JobTypeSchema`, `JobErrorSchema.code`, `Role`, `AppConfig`, `newId` префиксы, `quarantineDraft(Pick<Draft,"dir">)`, `claimNext` + `resource_locks`, `JobContext.heavy` (V8).
- **Без моков в приёмке:** реальные ffmpeg, ASR-воркер ai-platform, Apple Vision, `claude`; фейковые воркер и агенты — только в юнит-тестах логики; UI-тесты без LLM идут на реальных импорте, ASR и Vision.
- Устаревший `aiplatform/motion` не упоминается как источник; ai-platform не меняется (только запуск воркера и `git rev-parse`).
- **Вне Phase 2–3:** генерация сцен по плану, Scene Inspector, Approval C (Phase 4); сборка финала и экспорт видео (Phase 5).
