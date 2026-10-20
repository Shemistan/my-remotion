# Transitions (TransitionSeries) — `remotion-skills/transitions`

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

Не рисует; документ о переходах между сценами в `<TransitionSeries>`.

## Когда использовать

Смена темы, главы, слайда без резкой склейки. Два механизма:
`<TransitionSeries.Transition presentation timing>` — сцены играют
одновременно, таймлайн короче (60+60−15 = 105); `<TransitionSeries.Overlay
durationInFrames offset?>` — эффект поверх склейки, длину не меняет. Между
оверлеем и переходом должна быть сцена.

## Фразы из озвучки

- «переходим к следующей теме»
- «а теперь совсем другая история»
- «перелистнём страницу»

## Визуальный стиль

Описываемые приёмы: кроссфейд, сдвиг, шторка, переворот, часовая шторка,
световая засветка.

## Входные данные

Нет (документ).

## Анимации

- `fade()`, `slide({direction: 'from-left'|'from-right'|'from-top'|'from-bottom'})`,
  `wipe()`, `flip()`, `clockWipe()` из `@remotion/transitions/<name>`;
- `linearTiming({durationInFrames})`, `springTiming({config, durationInFrames?})`,
  `getDurationInFrames({fps})`;
- своя презентация: компонент с `presentationDirection`/`presentationProgress`;
- оверлей `lightLeak({progress})` на `<Solid>` через `Interactive.create`.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/transitions.md`

## Зависимости

`@remotion/transitions`, `@remotion/effects`, `remotion`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

`transformation`, `sequence-steps`
