# LatticeLoader — `react-bits/lattice-loader`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `timers` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Индикатор работы AI: сетка 3×3/4×4 клеток с бегущим узором (orbit,
snake, spiral, ripple, rain, pulse…), подпись «Thinking» и таймер; при
`status = 'done' | 'error'` клетки складываются в галочку/крест и
подпись меняется на «Done in 3.2s» / «Failed after…».

## Когда использовать

Демо AI-продукта, агент «думает», выполнение задачи, ожидание результата.

## Фразы из озвучки

- «модель обдумывает запрос»
- «готово за три секунды»
- «агент работает над задачей»

## Визуальный стиль

Минималистичная строка-статус: клетки 6 px, текст 14 px, зелёный
`#22c55e` для готово, красный `#ef4444` для ошибки, опциональное свечение.

## Входные данные

`label = 'Thinking'`, `doneLabel = 'Done in'`, `errorLabel = 'Failed after'`,
`status = 'working'` (`working|done|error`), `pattern = 'orbit'` (имя из
`PATTERNS` или объект `{cells, loop, scale, lit}`), `grid = 3` (3|4),
`shape = 'round'`, `color = 'currentColor'`, `doneColor`, `errorColor`,
`cellSize = 6`, `gap = 2`, `fontSize = 14`, `step = 90` (мс),
`idleOpacity = 0.15`, `glow = false`, `glowColor = ''`, `showTimer = true`,
`elapsed` (секунды, внешний таймер), `className`, `style`.

## Анимации

CSS-анимация клеток (`--ll-cycle`, `animationDelay` на клетку); таймер —
`setInterval` 100 мс, если не задан `elapsed`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Micro/LatticeLoader/LatticeLoader.jsx` (+ `LatticeLoader.css`)
- `templates/react-libriry/react-bits/src/ts-default/Micro/LatticeLoader/LatticeLoader.tsx`
- `templates/react-libriry/react-bits/src/demo/Micro/LatticeLoaderDemo.jsx`

## Зависимости

`react`; только CSS.

## Совместимость и адаптация

`adaptable`: передавать `elapsed = frame / fps` (таймер отключается),
`status` переключать по кадру; CSS-анимацию клеток — рецепт R4
(`animationDelay: -(frame/fps)s` + `animationPlayState: paused` поверх
задержек клеток).

## Паттерны

`sequence-steps`, `timeline`
