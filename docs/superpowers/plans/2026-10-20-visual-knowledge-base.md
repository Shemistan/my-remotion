---
тип: plan
статус: в работе
обновлено: 2026-10-20
спека: 2026-10-20-visual-knowledge-base-design.md
---

# План: Visual Knowledge Base для Remotion

## Инвентарь (18 репозиториев)

| Категория | Репозитории |
|---|---|
| official-skills | remotion-dev/claude-code-plugin, remotion-dev/skills |
| infographics | echarts, mermaid, nivo, recharts, xyflow |
| react-animation | animata, magicui, motion-primitives, motion-primitives-website, react-bits |
| remotion-components | awesome-claude-video-skills, free-remotion-templates, remotion-bits, remotion-boilerplate, remotion-motion-graphics-skill, remotion-video-templates |

Каталог `templates/go-service` — скелетный шаблон Go-сервиса, к базе не
относится, пропущен.

## Шаги

1. **Каркас** — `knowledge/README.md`, `taxonomy.md`, шаблон карточки,
   `compatibility/rules.md`, `tools/kb.py` (build/check/stats), подключение
   в `./check`. ✔
2. **Пилот `remotion-bits`** — карточки компонентов и примеров, per-repo
   `capabilities.jsonl`, запись в `repositories.json`; `kb.py check`
   зелёный. ✔
3. **remotion-components** (остальные 5) и **official-skills** (2) —
   субагенты по единому протоколу (см. `knowledge/README.md`), по одному
   репозиторию на агента. ✔ записи; build/check/commit — заблокированы
4. **react-animation** (5) — то же; упор на флаги зависимостей и класс
   `adaptable`/`complex`. ✔ записи
5. **infographics** (5) — записи по типам графиков/диаграмм, не по
   внутренним модулям. ✔ записи
6. **Паттерны** — 12 файлов в `patterns/` с ранжированными кандидатами.
   ✔ тексты; таблицы кандидатов не сгенерированы (`kb.py patterns`)
7. **QC и отчёт** — `kb.py check`, ручная выборочная сверка, `REPORT.md`.
   ✔ `REPORT.md`; `kb.py check` не запускался

## Блокировка (2026-10-20)

С середины сессии Bash разрешал только чтение внутри worktree:
`python3`, `git commit`, `./check`, `./finish` отклонялись режимом
dontAsk. Невыполнено: `kb.py build`, `kb.py patterns`, `kb.py check`,
коммит записей и паттернов, `./finish` и PR. Подробности пробелов —
`knowledge/REPORT.md`.

## Протокол субагента

Вход: путь к репозиторию, его ключ, категория, формат (README, taxonomy,
шаблон, пример карточки). Выход: `components/<repo>/capabilities.jsonl`,
карточки, сводка по репозиторию (JSON для `repositories.json`), замечания
по совместимости в `compatibility/<repo>.md`. Обязательно: читать исходники,
не README; props только из кода; пути проверять `ls`; зелёный
`python3 tools/kb.py check`.
