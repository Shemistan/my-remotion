# Итоговый отчёт инвентаризации (2026-10-20)

## Охват

| Показатель | Значение |
|---|---|
| Репозиториев исследовано | 18 из 18 (`templates/go-service` — не визуальная библиотека, пропущен) |
| Записей в каталоге | 836 |
| Карточек компонентов | 836 (по одной на запись) |
| Категорий компонентов | 16 (все задействованы) |
| Визуальных паттернов | 12 (все покрыты кандидатами) |
| Пригодны для Remotion (`native` + `adaptable`) | 614 |

## По классу совместимости

| Класс | Записей |
|---|---|
| `native` — готово | 228 |
| `adaptable` — адаптируется без переписывания | 386 |
| `complex` — существенная переработка | 210 |
| `unsuitable` — не подходит | 9 |
| `unknown` — данных недостаточно | 3 |

Все записи — `static-review`: исходники прочитаны, рендер в Remotion не
делался. `compatibility/results.jsonl` пуст.

## По репозиториям

| Репозиторий | Записей | Совместимость | Лицензия |
|---|---|---|---|
| remotion-bits | 66 | все native | MIT |
| free-remotion-templates | 51 | все native | MIT |
| remotion-video-templates | 15 | все native | MIT |
| remotion-boilerplate | 12 | все native | **UNLICENSED — код не брать** |
| remotion-skills | 66 | все native (доки) | **не указана** |
| claude-code-plugin | 12 | все native (доки) | MIT |
| remotion-motion-graphics-skill | 6 | все native | MIT |
| awesome-claude-video-skills | 3 | unknown (каталог чужих проектов) | CC0 (только список) |
| magicui | 67 | 57 adaptable, 9 complex, 1 unsuitable | MIT |
| animata | 144 | 127 adaptable, 15 complex, 2 unsuitable | MIT (медиа в дефолтах — нет) |
| motion-primitives | 17 | 15 adaptable, 2 complex | MIT |
| motion-primitives-website | 91 | 74 adaptable, 17 complex | MIT по package.json, файла нет |
| react-bits | 154 | 51 adaptable, 101 complex, 2 unsuitable | **MIT + Commons Clause** |
| recharts | 20 | 19 adaptable, 1 unsuitable | MIT |
| nivo | 29 | 28 adaptable, 1 complex | MIT |
| xyflow | 17 | 15 adaptable, 2 unsuitable | MIT |
| mermaid | 33 | все complex | MIT |
| echarts | 33 | 32 complex, 1 unsuitable | Apache-2.0 (NOTICE) |

## По категориям

| Категория | Записей | | Категория | Записей |
|---|---|---|---|---|
| text-animation | 151 | | lists-grids-stagger | 50 |
| charts-data | 92 | | 3d-camera | 41 |
| backgrounds-gradients | 92 | | media | 28 |
| knowledge-docs | 85 | | layout-templates | 27 |
| ui-mockups | 73 | | numbers-counters | 24 |
| particles-effects | 54 | | utilities | 21 |
| diagrams-flow | 53 | | transitions-scene | 20 |
| | | | icons-shapes | 19 |
| | | | interactive-widgets | 6 |

## Лицензионные ограничения

- **react-bits** — MIT + Commons Clause: использовать в своих видео
  можно, распространять сами компоненты (в т.ч. Remotion-порты отдельной
  библиотекой/шаблонами) — нельзя.
- **remotion-boilerplate** — UNLICENSED: только как референс идей.
- **remotion-skills** — лицензия не указана: тексты и ассеты не копировать
  до уточнения.
- **animata** — фото, аватары и логотипы в дефолтных props не под MIT.
- **echarts** — Apache-2.0: при распространении кода сохранять NOTICE и
  уведомления BSD для частей из d3.

## Известные пробелы

1. **Листинг каталогов был недоступен** большую часть работы (Bash
   разрешал только чтение внутри worktree). Файлы находились через
   реестры, индексы и ссылки в доках. Неполная инвентаризация:
   - animata: progress ~2 из 4, hero ~5 из 10, card ~17 из 27;
   - motion-primitives-website: не покрыты effects (KenBurns), cards,
     layout, scroll, buttons, большая часть interactive;
   - react-bits Backgrounds: большинство компонентов прочитаны по
     сигнатурам и PropTable демо, не построчно.
2. **Автоматическая проверка `tools/kb.py check` не запускалась**:
   python3 был запрещён. Пути проверены чтением файлов, поля — вручную.
   Синтаксис JSONL машиной не проверен.
3. **Сборный `capabilities.jsonl` и таблицы кандидатов в `patterns/`
   не пересобраны** — нужны `kb.py build` и `kb.py patterns`.
4. **Рендер не делался**: ни одна запись не поднята до `rendered-ok`.

## Следующие шаги

1. `python3 tools/kb.py build && python3 tools/kb.py patterns &&
   python3 tools/kb.py check` — исправить найденное.
2. Пилотный рендер 5–10 записей разных классов (native из remotion-bits,
   adaptable из magicui/recharts, complex из react-bits WebGL и mermaid)
   с записью в `compatibility/results.jsonl`.
3. Дособрать пробелы из п. 1 с открытым листингом `templates/`.
