# 04. Агентные процессы

Роль ≠ отдельная LLM-сессия (ТЗ §4). Детерминированную работу делает код, LLM —
только то, что требует суждения. Каждый вызов — один `claude -p` со схемой выхода.

## 1. Минимальный набор агентов

| Агент (вызов LLM) | Роли из ТЗ | Инструменты | Выход | Фаза |
|---|---|---|---|---|
| **Concept** | Visual Director + Art Director (частично) | нет | `ConceptOutput`: визуальная идея, паттерны KB, RU/EN ключи поиска, недостающие параметры | 1 |
| **Motion Director** | Motion Director + Art Director + выбор компонентов из Knowledge Researcher | нет | `MotionSpecification` + `ComponentSelection` | 1 |
| **Remotion Engineer** | Remotion Engineer | Read, Write, Edit, Glob, Grep в draft-каталоге | файлы `src/**` + `props.json` + `EngineerReport` | 1 |
| **Visual QA** | Visual QA | Read (кадры PNG и спецификация в draft-каталоге) | `QAReport` | 1 |
| **Edit Planner** | Production Supervisor (правки по чату) | нет | `EditPlan`: база, что менять, что взять из других версий | 1 |
| Semantic Director | Semantic Director | нет | `SemanticTimeline` | 3 |
| Footage Analyst | Footage Analyzer | Read (ключевые кадры) | `FootageAnalysis` | 3 |
| Visual Planner | Visual Director + Art Director | нет | `ScenePlan[]` + `StyleBible` | 3 |
| Rough Cut Editor | Rough Cut Editor | нет | `EditDecision[]` предложения | 2 |

Код, а не LLM:

| Роль ТЗ | Чем закрыта |
|---|---|
| Knowledge Researcher | `KnowledgeAdapter.search` по ключам от Concept + подготовка выдержек карточек; LLM только выбирает из кандидатов |
| Transcript Analyst | `AsrAdapter` + построение сегментов по паузам и пунктуации |
| Production Supervisor | `JobOrchestrator`: состояния, лимиты, retry-решения по правилам |
| Технический QA | typecheck, статический анализ импорта, рендер, ffprobe-проверка длительности и размеров |

## 2. Пайплайн Motion Playground: генерация

```text
user prompt + settings
   │
   ▼
[Concept] ── needs_clarification? ──▶ вопросы в чат, job → awaiting_input
   │ patterns[], kb_queries{ru[],en[]}, concept
   ▼
KnowledgeAdapter.search(…) ─▶ top-N кандидатов (фильтр: compat ∈ {native, adaptable},
   │                            license_class = permissive; restricted/unknown —
   │                            только по явному разрешению пользователя)
   ▼
[Motion Director] ─▶ MotionSpecification + ComponentSelection(strategy: reuse|adapt|build)
   │
   ▼
prepare draft: копия base-версии (если есть) + refs/ (исходники выбранных компонентов,
   │           выдержки skills, motion-kit API) + spec.json
   ▼
[Remotion Engineer] ─▶ src/Scene.tsx, props.json, EngineerReport
   │
   ▼
Technical gate: tsc → import/API-allowlist → bundle → renderStill(keyframes) → render preview.mp4
   │  fail ─▶ issues[] ─▶ Engineer (fix) — максимум 2 раза
   ▼
[Visual QA] на 4–6 ключевых кадрах (начало/пики битов/hold/конец) + спецификации
   │  blocking issues ─▶ Engineer (fix) — в том же лимите 2
   ▼
publish version (atomic rename, chmod a-w) ─▶ status: ready (+ QA-отчёт, даже если warnings)
```

Если лимит исправлений исчерпан, версия публикуется со статусом `failed` и всеми
логами и превью (если рендер был), а не скрывается.

## 3. Пайплайн: правка через чат

```text
"Уменьши скорость на 25 %, карточки объёмнее, палитру — из первой версии"
   │
   ▼
[Edit Planner] вход: текущая версия (spec, props, краткий diff истории),
   │          список версий с их палитрами/параметрами
   │ выход: base_version_id, changes[]{target, kind: param|code|spec, description},
   │        borrow[]{from_version_id, what: "palette"|…}, preserve[] ("composition")
   ▼
если только param-изменения ─▶ новый props.json без LLM-кода ─▶ render ─▶ QA
иначе ─▶ [Motion Director] (обновить spec от base) ─▶ [Engineer] (правка копии base src)
   ▼
QA дополнительно сверяет preserve[] с base: композиция (положение блоков на кадрах),
регрессия рендера (длительность, размеры, отсутствие новых ошибок)
```

«Медленнее на 25 %» трактуется как `duration_frames × 1/0,75` и масштабирование
битов; правило фиксируется в промпте Edit Planner и проверяется тестом 3.

## 4. Контракты (черновик, финал — Zod в `contracts/`)

```ts
type Ref = { kind: "file" | "version" | "kb" | "job"; id: string; path?: string };

interface AgentTask<I> {
  role: "concept" | "motion_director" | "engineer" | "visual_qa" | "edit_planner" | …;
  input: I;                     // валидируется схемой роли
  inputRefs: Ref[];             // откуда взяты входы
  workdir: string;              // draft-каталог; для ролей без инструментов — пустой tmp
  tools: ("Read"|"Write"|"Edit"|"Glob"|"Grep")[];
  model: string;                // из настроек роли
  limits: { timeoutMs: number; maxBudgetUsd: number };
  idempotencyKey: string;       // job_id + attempt
}

interface AgentResult<O> {
  status: "completed" | "failed" | "cancelled" | "timeout";
  output?: O;                   // structured_output, прошедший Zod
  error?: { kind: "schema"|"cli"|"budget"|"timeout"|"denied"; message: string };
  usage: { model: string; inputTokens: number; outputTokens: number; costUsd: number };
  permissionDenials: unknown[]; // из CLI, сохраняем как есть
  stdoutPath: string; stderrPath: string;
  startedAt: string; finishedAt: string; sessionId?: string;
}

interface ConceptOutput {
  needs_clarification: { question: string; default_if_skipped: string }[];
  concept: string;                       // визуальная метафора одной фразой
  patterns: PatternSlug[];               // из 12 паттернов KB
  kb_queries: { ru: string[]; en: string[] };
  composition_mode: "fullscreen" | "overlay" | …; // в Playground почти всегда fullscreen
}

interface ComponentSelection {
  items: { kb_id: string; strategy: "reuse" | "adapt" | "build"; why: string;
           files_to_copy: string[] }[];
}

interface QAReport {
  gate: { technical: Verdict; visual: Verdict; semantic: Verdict; style: Verdict };
  issues: { severity: "blocking" | "warning"; frame?: number; area?: string;
            description: string; fix_hint: string }[];
  checked_frames: number[];
  automated: true;                       // всегда: QA — вспомогательная оценка
}
type Verdict = "pass" | "warn" | "fail" | "not_checked";
```

## 5. AgentRuntimeAdapter и запуск Claude Code

```ts
interface AgentRuntimeAdapter {
  run<I, O>(task: AgentTask<I>, schema: ZodType<O>, signal: AbortSignal): Promise<AgentResult<O>>;
  capabilities(): Promise<{ available: boolean; version?: string; reason?: string }>;
}
```

Реализация `ClaudeCodeRuntime` (флаги проверены в Phase 0 на CLI 2.1.304):

```text
claude -p <prompt-from-file via stdin>
  --model <role.model>
  --restricted                       # файлы только в cwd/--add-dir, без Bash/WebFetch, без bypass
  --strict-mcp-config                # без MCP пользователя
  --tools "<role.tools>"             # "" для ролей без инструментов
  --permission-mode acceptEdits      # правки в cwd без вопросов (только для Engineer)
  --output-format json --json-schema '<JSON Schema роли>'
  --no-session-persistence
  --max-budget-usd <limit>
  --append-system-prompt "<содержимое prompts/<role>.md>"   # адаптер читает файл сам;
                                     # вариант *-file в --help упомянут только для --bare
cwd = <draft-каталог>, env = allowlist
```

- Таймаут: `AbortController` → SIGTERM, через 5 с SIGKILL; статус `timeout`.
- Ответ с `is_error: true`, пустым `structured_output` или не прошедший Zod → `failed`
  (одна автоматическая переотправка при ошибке схемы, в лимите попыток задачи).
- Сохраняем stdout/stderr в `agent-runs/<run-id>/`, `usage`, `modelUsage`, `session_id`,
  `permission_denials`.
- Секреты: процессу не передаются; промпты пишутся в файл до запуска и сохраняются
  в журнал (в них только данные задачи).
- Замена рантайма: второй адаптер (Anthropic API напрямую или Agent SDK) реализует
  тот же интерфейс; Phase 1 его не делает.

**Модели и лимиты (утверждено 2026-10-20, всё — в настройках, не в коде):**

| Роль | Модель по умолчанию | Ключ настройки |
|---|---|---|
| Motion Director, Remotion Engineer | Opus (`opus`) | `agents.<role>.model` |
| Concept, Visual QA, Edit Planner и остальные | Sonnet (`sonnet`) | `agents.<role>.model` |

Алиасы `opus`/`sonnet` разрешает сам CLI; фактическая модель берётся из `modelUsage`
ответа и пишется в `agent_runs.model`. Лимиты на вызов (`timeoutMs`, `maxBudgetUsd`) и на
сцену (`scene.maxCostUsd`, по умолчанию $5 как ориентир для тестов) — тоже в настройках.

**Условия использования** (подробно — `08-risks.md` §2): CLI запускается неизменённым,
пользователь входит своей подпиской через штатный вход Anthropic, приложение не
читает, не хранит и не передаёт токены и работает только для этого же пользователя.

**Смена runtime без переписывания архитектуры:**

1. API-ключ в том же CLI: `ClaudeCodeRuntime` с переменной `ANTHROPIC_API_KEY`, переданной
   только в env дочернего процесса из секрет-хранилища (Keychain). Меняется настройка, не код.
2. Agent SDK или Messages API: новая реализация `AgentRuntimeAdapter`
   (`AgentSdkRuntime`) с тем же `AgentTask`/`AgentResult`. Инструменты Engineer
   (Read/Write/Edit в draft-каталоге) — через SDK с тем же ограничением каталога.
   Выбор реализации — настройка `agents.runtime`.

## 6. Оркестрация и конкуренция

- Шаги пайплайна — задачи в `jobs` с `parent_job_id`; статусы
  `pending → running → completed | failed | cancelled | awaiting_approval | awaiting_input | blocked`
  (`blocked` — процессы прежней попытки не завершились подтверждённо, ADR 0007).
- Блокировка записи: одна активная задача, пишущая в сцену (`scene_locks` в SQLite,
  берётся транзакцией). Каждая попытка пишет в **свой** draft `drafts/<job-id>-a<attempt>/`,
  опубликованные версии не меняются, публикация проверяет fencing-токен попытки (ADR 0007) —
  параллельная запись в одну SceneVersion невозможна по построению.
- Независимые шаги (например, рендер разных сцен в Phase 4) идут параллельно в пределах
  лимитов из `03-target-architecture.md` §8.
- Повтор: `POST /jobs/:id/retry` создаёт новую попытку с тем же `idempotency_key`
  родителя; завершённые шаги переиспользуются по `input_hash`.

## 7. Доступ ролей к Knowledge Base (ТЗ §4.1)

| Агент | Что получает в промпте или refs/ |
|---|---|
| Concept | список 12 паттернов с однострочным описанием; категории таксономии |
| Motion Director | top-N кандидатов: `id, name, visualizes, use_when, remotion_compat, adaptations, license_class`; тексты паттернов из `patterns/*.md` |
| Engineer | `refs/`: исходники выбранных компонентов, карточки, выдержки official skills (`remotion-markup`: timing, sequencing, fonts, 3d, transitions), API motion-kit, StyleBible |
| Visual QA | spec, StyleBible, brief, кадры PNG; без исходников компонентов |
| Edit Planner | история версий: промпты, параметры, палитры, QA-итоги |
