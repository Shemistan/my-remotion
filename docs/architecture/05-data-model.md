# 05. Модель данных

Источник истины для состояния — SQLite (`studio.db`, WAL). Источник истины для
содержимого версии — её каталог с `manifest.json` (иммутабельный). Большие медиа —
только в файловой системе.

## 1. Workspace (ТЗ §7, уточнено)

```text
$MS_DATA_DIR/
  studio.db
  workspace/
    projects/<project-id>/
      project.json                  снимок метаданных (для ручного восстановления)
      source/                       Ph2: оригиналы, chmod a-w
      proxy/  transcript/  edits/  style/   Ph2–3
      timeline.json                 Ph5
      scenes/<scene-id>/
        brief.json                  исходный запрос и настройки
        versions/<version-id>/      ИММУТАБЕЛЬНО после публикации
          manifest.json             см. §4
          spec.json                 MotionSpecification
          knowledge-refs.json       выбранные компоненты с provenance
          src/                      код сцены (Scene.tsx и модули)
          props.json
          assets/                   локальные ассеты версии
          frames/                   QA-кадры PNG
          preview.mp4
          qa.json
          logs/                     технические логи рендера
        approved.json               Ph4: утверждённая версия
      exports/<export-id>/          MP4/MOV + export-manifest.json
    drafts/<job-id>/                рабочие каталоги агентов (удаляются после публикации/по TTL)
    agent-runs/<run-id>/            prompt.md, stdout.json, stderr.log
```

`motion-spec.json` и `knowledge-refs.json` из примера ТЗ хранятся **в версии**, а не на
уровне сцены: они меняются при правках и должны воспроизводить именно эту версию.

## 2. Таймкоды (ТЗ §7.1)

| Ось | Единица | Тип | Где |
|---|---|---|---|
| `source_time` | микросекунды | INTEGER (`*_us`) | медиа, транскрипт (Ph2) |
| `edited_time` | микросекунды | INTEGER | таймлайн после EDL (Ph2) |
| `scene_local_time` | кадры | INTEGER | Motion Spec, код сцены |
| FPS | рациональное | `{num, den}` | все сущности с кадрами |

Пересчёт `us ↔ frame`: `frame = floor(us * num / (den * 1e6))` — одна функция в
`contracts/time.ts` с тестами на 29,97/30000:1001. VFR-исходники (Ph2): время берём из
PTS ffprobe, для таймлайна приводим к CFR прокси, фиксируем маппинг в `MediaAsset`.

Смысловые якоря — ссылки на `TranscriptWord.id`/`segment.id`, а не секунды.
Изменение EDL помечает затронутые якоря `stale` и ставит задачу перепроверки (Ph2–3).

## 3. Таблицы SQLite

Phase 1 (обязательные):

| Таблица | Ключевые поля |
|---|---|
| `projects` | `id`, `kind` (`playground`\|`video`), `title`, `settings_json`, `created_at`, `updated_at` |
| `scenes` | `id`, `project_id`, `title`, `current_version_id`, `approved_version_id`, `created_at` |
| `scene_versions` | `id`, `scene_id`, `parent_version_id`, `number` (v1, v2…), `status` (`draft`\|`ready`\|`failed`), `prompt`, `edit_plan_json`, `settings_json`, `path`, `manifest_sha256`, `created_by_job_id`, `created_at` |
| `chat_messages` | `id`, `scene_id`, `role` (`user`\|`assistant`\|`system`), `text`, `version_id`, `job_id`, `created_at` |
| `jobs` | `id`, `type`, `project_id`, `scene_id`, `version_id`, `parent_job_id`, `status`, `progress` (0–1), `stage`, `attempts`, `max_attempts`, `input_refs_json`, `input_hash`, `output_refs_json`, `error_json`, `idempotency_key` UNIQUE, `lease_owner`, `lease_until`, `cancel_requested`, `created_at`, `started_at`, `finished_at` |
| `job_events` | `id` (монотонный), `job_id`, `ts`, `level`, `kind`, `message`, `data_json` — для SSE и журнала |
| `agent_runs` | `id`, `job_id`, `role`, `model`, `status`, `input_tokens`, `output_tokens`, `cost_usd`, `session_id`, `permission_denials_json`, `log_dir`, `started_at`, `finished_at` |
| `render_jobs` | `id`, `job_id`, `version_id`, `kind` (`still`\|`preview`\|`export`), `codec`, `width`, `height`, `fps_num`, `fps_den`, `frames`, `output_path`, `ffprobe_json`, `duration_ms` |
| `qa_reports` | `id`, `version_id`, `attempt`, `technical`, `visual`, `semantic`, `style`, `report_path` |
| `knowledge_refs` | `id`, `version_id`, `kb_id`, `repo`, `commit`, `license`, `license_class`, `strategy`, `source_paths_json` |
| `exports` | `id`, `version_id`, `job_id`, `format`, `path`, `sha256`, `created_at` |
| `component_tests` | `kb_id`, `remotion_version`, `result`, `version_id`, `date` — реальные рендер-проверки компонентов |
| `scene_locks` | `scene_id` PK, `job_id`, `acquired_at` |

Phase 2–5 (добавляются миграциями): `media_assets`, `transcripts`, `transcript_words`,
`transcript_segments`, `edit_decisions`, `timelines`, `timeline_clips`,
`semantic_chapters`, `visual_opportunities`, `footage_analyses`, `style_bibles`,
`scene_plans`, `approvals`.

Миграции — пронумерованные SQL-файлы, версия в `PRAGMA user_version`.

## 4. Manifest версии

```json
{
  "schema_version": 1,
  "version_id": "ver_01J…",
  "scene_id": "scn_01J…",
  "parent_version_id": "ver_01H…",
  "number": 3,
  "created_at": "2026-…",
  "prompt": "Уменьши скорость анимации на 25 %…",
  "edit_plan": { "base_version_id": "…", "borrow": [{"from": "ver_v1", "what": "palette"}] },
  "settings": { "aspect_ratio": "16:9", "width": 1920, "height": 1080,
                "fps": {"num": 30, "den": 1}, "duration_frames": 203, "…": "…" },
  "files": [{ "path": "src/Scene.tsx", "sha256": "…" }, { "path": "props.json", "sha256": "…" }],
  "changed_files": ["src/Scene.tsx", "props.json"],
  "render_env": { "remotion": "4.0.537", "render_lock_sha256": "…", "motion_kit": "0.1.0",
                  "chrome_headless_shell": "…", "node": "22.21.1" },
  "knowledge_refs": [{ "kb_id": "remotion-bits/animated-counter", "commit": "de35fda",
                       "license": "MIT", "strategy": "adapt" }],
  "agent_runs": ["run_…"],
  "qa": { "technical": "pass", "visual": "warn", "semantic": "pass", "style": "pass" },
  "preview": { "path": "preview.mp4", "sha256": "…" }
}
```

Воспроизводимость: рендер версии использует только `src/`, `props.json`, `assets/`,
motion-kit указанной версии и render-пакет с тем же lockfile. Если `render_lock_sha256`
отличается от текущего, UI предупреждает «рендер в другом окружении».

## 5. Версии: правила

- Новая версия всегда создаётся от `parent_version_id` (база может быть любой старой
  версией: «верни v2, но сохрани новые цвета» → parent = v2, borrow = palette из v4).
- Восстановление старой версии = новая версия-копия с `parent = старая`, история не
  удаляется; `scenes.current_version_id` двигается.
- Сравнение: diff `props.json`, `spec.json`, файлов `src/` и side-by-side превью.
- Неудачная попытка тоже публикуется как версия со статусом `failed` (с логами и
  превью, если оно есть), но не становится `current` автоматически.

## 6. Состояния задач

```text
pending ──lease──▶ running ──▶ completed
   ▲                  │  ├──▶ failed       (attempts исчерпаны или неустранимая ошибка)
   │                  │  ├──▶ cancelled    (cancel_requested)
   │                  │  ├──▶ awaiting_input     (Concept просит уточнение)
   │                  │  └──▶ awaiting_approval  (Ph2+: approvals A/B/C)
   └── lease истёк при рестарте: attempts < max → pending, иначе failed(interrupted)
```

Идемпотентность: клиент шлёт заголовок `Idempotency-Key`; повторный POST с тем же
ключом возвращает существующую задачу. Шаги пайплайна с одинаковым `input_hash` и
статусом `completed` не перезапускаются.

## 7. Approvals (Phase 2+)

`approvals(id, project_id, kind: A|B|C|final, subject_ref, subject_hash, status,
decided_at)`. Approval валиден, пока `subject_hash` совпадает с текущим хешем
утверждённого артефакта (EDL, план, версия сцены). Изменение артефакта → approval
`stale`; финальная сборка проверяет, что все approvals свежие.
