# AI Motion Studio — архитектура (Phase 0)

Результат Phase 0 по `AI_Motion_Studio_TZ.md` v1.2 (разделы 13 и 17).
Статус: **ждёт утверждения**, Phase 1 не начата.

| Документ | О чём |
|---|---|
| [01-current-state](01-current-state.md) | что реально есть: ai-platform, my-remotion, KB, окружение, headless Claude |
| [02-integration-map](02-integration-map.md) | что переиспользуем, что создаём, точки интеграции ASR и KB, диаграмма зависимостей |
| [03-target-architecture](03-target-architecture.md) | размещение, схема, стек, структура кода, безопасность, сценарий запуска |
| [04-agent-workflows](04-agent-workflows.md) | минимальный набор агентов, пайплайны, контракты, запуск Claude Code |
| [05-data-model](05-data-model.md) | workspace, таймкоды, таблицы, manifest, версии, статусы задач |
| [06-motion-engine](06-motion-engine.md) | motion-kit, детерминизм, StyleBible, рендер, визуальный QA |
| [07-implementation-roadmap](07-implementation-roadmap.md) | фазы и backlog Phase 1 с зависимостями и сложностью |
| [08-risks](08-risks.md) | риски и меры |
| [09-acceptance-tests](09-acceptance-tests.md) | критерии готовности и тесты 1–4 |

Решения с альтернативами — ADR 0001–0004 в [`docs/decisions/`](../decisions/README.md).

**Источник истины** — `AI_Motion_Studio_TZ.md` v1.2. Устаревший `aiplatform/motion/`
исключён из источников требований и решений (`01` §3.2а).

## Вопросы, без которых Phase 1 не стартует

1. **Размещение** (`03` §1): подтвердить отдельное приложение `my-remotion/app/motion-studio/`;
   ai-platform — только поставщик ASR и изображений.
2. **Где хранить данные:** `~/MotionStudio` (системный диск, свободно 61 ГБ) или внешний SSD.
3. **Claude Code headless под подпиской** — подтвердить допустимость и модели ролей
   (предложение: Opus 5.5 для Motion Director и Engineer, Sonnet 5.5 для остальных);
   лимит бюджета на одну сцену (предложение $5).
4. **Лицензия Remotion:** проект личный или для компании больше 3 человек (тогда
   нужна Company License).

Неблокирующие допущения (можно поменять позже): порт `127.0.0.1:8790`; Node 22;
3 стилевых пресета; превью в половинном разрешении; лимит 2 автоисправления.
