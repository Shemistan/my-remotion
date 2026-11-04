---
тип: plan
статус: завершено
обновлено: 2026-11-04
спека: 2026-11-04-codex-delegation-design.md
---

# Делегирование в Codex: план реализации

**Goal:** часть вызовов агентов идёт в Codex CLI. Это включается в настройках, долю
задаёт ползунок от минимума до безопасного максимума. Качество держат предохранители
спеки §2.

Одна ветка `worktree-codex-delegation`, задачи по порядку; после каждой — `./check`.

- [x] **T1. CodexRuntime** — `server/src/agents/codex.ts`: аргументы, строгая схема,
  разбор JSONL и `-o`, журналы, таймаут и отмена, `capabilities()`. Юнит-тесты на
  подменённом `spawn`.
- [x] **T2. Конфиг** — `codex.*` и `delegation.*` в `config.ts` (FileSchema,
  SettingsPutSchema только для `delegation`), `AppConfig`, DTO в `contracts`.
- [x] **T3. Политика** — `server/src/agents/delegation.ts`: веса ролей (история
  `agent_runs` / встроенные), план долей по уровню, минимум и безопасный максимум,
  хеш-решение, статистика чистоты и авто-пауза (`$MS_DATA_DIR/delegation-state.json`,
  без миграции БД). Юнит-тесты.
- [x] **T4. RoutingRuntime** — `server/src/agents/routing.ts`: предохранители 1–3,
  фолбэк в Claude, живое обновление политики; подключение в `boot.ts`. Тесты.
- [x] **T5. API** — `GET /api/delegation`, `POST /api/delegation/resume/:role`;
  PUT `/api/settings` применяет `delegation` сразу; доступность codex — в `GET /api/delegation`.
  `/health` и `doctor` — не сделано, следующий шаг.
- [x] **T6. UI** — блок «Делегирование в Codex» на странице настроек, i18n.
- [x] **T7. Документы** — ADR 0011, раздел руководства (глава 8).
