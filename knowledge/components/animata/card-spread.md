# CardSpread — `animata/card-spread`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | example |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Колода из четырёх карточек-виджетов (заметки, список покупок, идеи
ремонта, напоминания): в сложенном виде лежат стопкой в центре; по клику
«Spread cards» разлетаются в ряд из 4 колонок с лёгкими поворотами
(−2°, 3°, −2°, 2°), обратно — собираются.

## Когда использовать

«Разложим всё по полочкам», раскрытие набора инструментов/заметок,
переход от «кучи» к упорядоченному ряду. Переход воспроизвести по кадру.

## Фразы из озвучки

- «разложим всё по полочкам»
- «вот всё, что у вас под рукой»
- «из хаоса — порядок»

## Визуальный стиль

Светлые карточки-виджеты `w-48`; «бросок» `cubic-bezier(0.22,1.18,0.36,1)`
480 мс, сборка `cubic-bezier(0.33,1,0.68,1)` 520 мс.

## Входные данные

Props нет. Карточки зашиты (`Notes`, `ShoppingList`, `RemodelNotes`,
`Reminders`). Состояние — скрытый checkbox `.card-spread-toggle` и
`:has(:checked)` в CSS.

## Анимации

`card-spread.css`: в колоде `translate3d(±150%/±50% + gap)` к центру; в
раскладе — свои сдвиги и повороты; `transition: transform`; hover-«peek»
колоды — повороты ±1–2°.

## Исходники и документация

- `templates/react-libriry/animata/animata/card/card-spread.tsx` — компонент
- `templates/react-libriry/animata/animata/card/card-spread.css` — состояния и переходы
- `templates/react-libriry/animata/content/docs/card/card-spread.mdx` — документация
- `templates/react-libriry/animata/animata/card/card-spread.stories.tsx` — пример

## Зависимости

`@/animata/widget/notes`, `@/animata/widget/shopping-list` (виджеты вне
этого среза), Tailwind v4.

## Совместимость и адаптация

Две позы заданы явно в CSS → `transform` карточки i =
`interpolate(p_i, [0,1], [deckPose_i, spreadPose_i])` с
`Easing.bezier(0.22,1.18,0.36,1)`, `p_i` из кадра со stagger. Checkbox и
`:has()` убрать, карточки передавать children.

## Паттерны

`transformation`, `sequence-steps`
