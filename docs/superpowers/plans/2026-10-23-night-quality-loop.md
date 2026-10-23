---
тип: plan
статус: завершено
обновлено: 2026-10-23
спека: 2026-10-23-night-quality-loop-design.md
---

# План: ночной цикл качества

> Исполнение: superpowers:subagent-driven-development, независимое ревью после реализации.

**Цель:** `./night` — одна команда на ночь: берёт пункты `docs/quality-backlog.md`, улучшает
генератор в изолированной ветке, принимает изменение только при росте оценки судьи на обоих
наборах, утром — отчёт с роликами.

## Глобальные ограничения

- Никаких новых прав; `.claude/settings.json`, guard, `main`/`staging` не трогать.
- Данные только в `MS_DATA_DIR`; SSD отключён → остановка.
- Рубрика судьи и состав наборов bench не меняются ночью.
- Ни одна команда ночи не удаляет и не переписывает ветки/коммиты: только новые ветки
  `night/<дата>-<n>` и fast-forward `night/<дата>`.

## Фокус ревью

1. SSD отключён посреди ночи → остановка с записью в отчёт, без записи на системный диск.
2. Агент итерации завис или превысил бюджет → итерация прерывается, ночь продолжается.
3. bench упал на половине сцен → итерация «не принято», не «принято» по неполным данным.
4. Повторный запуск `./night` той же ночью → продолжение (`--resume`), без двойной базовой линии.
5. Пустой бэклог / все пункты «не дало роста» → ночь завершается досрочно с отчётом.

### Task 1: правило приёмки и бэклог

**Files:** Create `app/motion-studio/server/src/bench/night-accept.ts`, `server/test/bench/night-accept.test.ts`,
`app/motion-studio/server/src/bench/quality-backlog.ts` (+test), `docs/quality-backlog.md`.

- `acceptNight(base: BenchSummary, cand: BenchSummary): {accepted: boolean; reasons: string[]}` —
  пороги из спеки (+0.1 explainer и compare «принять»; user −0.2; failed не растёт; p90 ≤ $5;
  медиана времени ≤ +25 %). Неполный прогон (не все сцены набора) → не принято.
- `parseBacklog(md)` / `nextItem` / `markItem(md, id, status)` — формат списка в
  `docs/quality-backlog.md` (id, заголовок, статус, история).
- Начальное содержание бэклога — раздел «Бэклог» спеки, по порядку.

### Task 2: оркестратор ночи

**Files:** Create `app/motion-studio/scripts/night.mts`, `./night` (корень), `app/motion-studio/scripts/NIGHT.md`,
тесты оркестрации на фейковых `runAgent`/`runBench`/`git`.

- Предпроверки, worktree `night-<дата>`, ветки итераций, `--until`, `--budget-usd`, `--resume`,
  `--dry-run` (ничего не тратит, печатает план ночи).
- `runAgent` — `claude -p` с брифом итерации (шаблон в `app/motion-studio/scripts/night-brief.md`),
  лимит времени/денег, журнал в `tmp/night/<дата>/<n>/`.
- `runBench` — `bench-set.mts` на наборах explainer и user с судьёй.
- Состояние ночи — `tmp/night/<дата>/state.json` (для `--resume`).

### Task 3: утренний отчёт и приёмка

- `REPORT.md` по-русски, копирование роликов в `tmp/motion-studio-examples/night-<дата>-*` + README.
- Реальная приёмка: `./night --dry-run`, затем короткая настоящая ночь `--until` на ~2 ч с одним
  пунктом бэклога (bench только на 2+2 сценах флагом `--smoke`) — отчёт и ветки созданы,
  правило приёмки сработало.
