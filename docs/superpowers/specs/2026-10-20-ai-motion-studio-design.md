---
тип: spec
статус: утверждено
обновлено: 2026-10-20
план: 2026-10-20-motion-playground-mvp.md
---

# AI Motion Studio: архитектура (Phase 0)

Дизайн оформлен по требованию ТЗ (`AI_Motion_Studio_TZ.md` v1.2, §13) как набор
документов в `docs/architecture/`. Эта спека — точка входа в superpowers-цикл и
фиксирует статус утверждения.

- Текущее состояние и проверенные факты: `docs/architecture/01-current-state.md`.
- Интеграции: `docs/architecture/02-integration-map.md`.
- Целевая архитектура и сводка утверждённых решений: `docs/architecture/03-target-architecture.md`,
  `docs/architecture/README.md`.
- Агенты, данные, движок: `04`–`06`.
- Дорожная карта, риски, приёмка: `07`–`09`.
- Решения: ADR 0001–0006 (приняты), ADR 0007 (предложено).

Утверждено человеком 2026-10-20: размещение, исключение устаревшего
`aiplatform/motion/`, персональный локальный режим, хранилище на внешнем SSD, Claude Code
как runtime (при соответствии правилам Anthropic), Remotion по Free License. Сводка —
`docs/architecture/README.md` «Утверждённые решения».
