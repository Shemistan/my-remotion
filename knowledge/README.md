# Visual Knowledge Base для AI-монтажа на Remotion

База визуальных возможностей, собранная из клонированных репозиториев в
`templates/` и `official_skills/`. Нужна, чтобы агент-режиссёр подбирал
визуальное решение по смыслу озвучки, не читая исходники всех библиотек,
а агент-разработчик шёл в исходники только выбранного решения.

## Как пользоваться

1. **Понять, что показать.** Определи тип визуальной задачи из
   `taxonomy.md` → «Визуальные паттерны» (рост/падение, сравнение,
   таймлайн, структура…). Открой `patterns/<slug>.md` — там ранжированный
   список подходящих решений с условиями выбора.
2. **Найти кандидатов по смыслу.** `capabilities.jsonl` — одна JSON-строка
   на возможность. Ищи по полям `visualizes`, `use_when`, `voiceover_cues`
   (фразы из озвучки по-русски), `category`, `patterns`:

   ```bash
   grep -i 'рост' knowledge/capabilities.jsonl | python3 -c \
     'import sys,json; [print(r["id"], "|", r["remotion_compat"], "|", r["visualizes"]) for r in map(json.loads, sys.stdin)]'
   ```

3. **Отфильтровать по совместимости.** `remotion_compat`: сначала `native`,
   потом `adaptable`; `complex` — только если ничего другого нет и есть
   время на переработку; `unsuitable` — не брать. `compat_flags` говорит,
   что именно придётся нейтрализовать (CSS-анимации, rAF, движки).
4. **Прочитать карточку.** `components/<repo>/<slug>.md` — реальные props,
   анимации, зависимости, нужные адаптации, пути к исходникам.
5. **Только теперь идти в исходники** по путям из `source_files` (они
   относительны корня проекта, где лежат `templates/` и `official_skills/`).
6. **Проверить в Remotion и записать результат.** Статус `verification`
   у большинства записей — `static-review`: исходники прочитаны, но в
   Remotion не рендерилось. После реального рендера добавь строку в
   `compatibility/results.jsonl` и подними статус до `rendered-ok` /
   `rendered-fail`.

## Структура

| Путь | Что это |
|---|---|
| `README.md` | этот файл |
| `taxonomy.md` | словари: категории, виды, классы совместимости, флаги, паттерны |
| `repositories.json` | реестр репозиториев: путь, URL, commit, лицензия, назначение, где лежат компоненты и примеры |
| `capabilities.jsonl` | машиночитаемый каталог; **собирается** из `components/<repo>/capabilities.jsonl` командой `python3 tools/kb.py build` |
| `components/<repo>/` | карточки компонентов (`<slug>.md`) и исходный `capabilities.jsonl` репозитория |
| `components/_TEMPLATE.md` | шаблон карточки |
| `patterns/<slug>.md` | визуальные паттерны → подходящие компоненты |
| `compatibility/rules.md` | правила классификации и типовые адаптации |
| `compatibility/results.jsonl` | результаты реальных проверок в Remotion |
| `compatibility/<repo>.md` | заметки по совместимости конкретного репозитория |
| `REPORT.md` | итоговый отчёт инвентаризации |

## Схема записи `capabilities.jsonl`

Все поля обязательны; перечисления — в `taxonomy.md`.

| Поле | Тип | Смысл |
|---|---|---|
| `id` | `<repo>/<slug>` | уникальный идентификатор; `repo` — ключ из `repositories.json` |
| `name` | string | человекочитаемое название |
| `repo` | string | ключ репозитория |
| `kind` | enum | component / example / template / chart-type / diagram-type / hook / util / doc |
| `category` | enum | категория из taxonomy |
| `visualizes` | string | что появляется на экране |
| `use_when` | string | сценарии использования и когда не брать |
| `voiceover_cues` | string[] ≥2 | фразы из озвучки по-русски, под которые это решение |
| `visual_style` | string | стиль: форма, цвет, темп |
| `inputs` | string | реальные props/данные (имена из исходников) |
| `animations` | string[] | какие анимации поддерживает |
| `source_files` | string[] | пути от корня проекта, существуют |
| `docs` | string[] | пути к докам/примерам или URL |
| `dependencies` | string[] | npm-пакеты, внутренние модули |
| `remotion_compat` | enum | native / adaptable / complex / unsuitable / unknown |
| `compat_flags` | string[] | css-animation, raf, dom, user-events, engine:*, canvas, webgl, svg, async-data, timers, external-service |
| `adaptations` | string | что менять для покадрового рендера; при `unknown` — чего не хватает |
| `verification` | enum | unverified / static-review / rendered-ok / rendered-fail |
| `patterns` | string[] | слаги паттернов |
| `license` | string | лицензия и источник сведения |
| `card` | string | путь карточки относительно `knowledge/` |

## Контроль качества

```bash
python3 tools/kb.py build   # пересобрать capabilities.jsonl
python3 tools/kb.py check   # проверки (входит в ./check)
python3 tools/kb.py stats   # сводка
```

Проверяются: валидность JSON и перечислений, уникальность id, наличие
карточек, существование всех путей к исходникам (относительно корня с
`templates/`), наличие сценариев и фраз озвучки, лицензии репозиториев,
ссылки паттернов на существующие id, актуальность сборного файла.

## Правила ведения

- Не копировать исходники в базу — только пути и короткие выдержки API.
- Не выдумывать props и пути: всё из кода. Нет данных — `unknown` и
  явное «недостаточно данных» в `adaptations`.
- Один компонент — одна запись. Варианты одного компонента (пресеты,
  примеры) — отдельные записи вида `example`, если они дают другой
  визуальный результат.
- Карточки короткие (до ~80 строк). Большие библиотеки дробятся по
  компонентам, а не описываются одним файлом.
- Исходный репозиторий не изменяется; фиксируется его commit в
  `repositories.json`.
