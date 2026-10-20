# Multi-scene videos — `remotion-skills/multi-scene-video`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-skills` (`official_skills/skills`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | не указана (нет LICENSE, нет поля license в package.json) |

## Что визуализирует

Не рисует; документ о структуре ролика из нескольких сцен.

## Когда использовать

Ролик из частей (интро — основная часть — финал). Каждая крупная сцена —
свой компонент (при необходимости связанная композиция), имя/тайминг/пропсы
инстанса inline в родителе. Независимые старты — именованный `Track` с
`from` и `durationInFrames`, без перекрытий. Смежные сцены, которые должны
оставаться встык при смене длительности, — `TransitionSeries`, каждая в
своём `TransitionSeries.Sequence`; перекрытия переходов учесть в общей длине.

## Фразы из озвучки

- «в первой части мы расскажем…»
- «переходим к следующей главе»
- «и в завершение»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет; структура (`Track`, `TransitionSeries`).

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/multi-scene-video.md`
- см. `remotion-skills/transitions`, `remotion-skills/connected-compositions`

## Зависимости

`remotion`, `@remotion/transitions`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

`sequence-steps`, `timeline`
