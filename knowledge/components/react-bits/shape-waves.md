# ShapeWaves — `react-bits/shape-waves`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `engine:other`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Сетка геометрических глифов (треугольники/круги/квадраты по полосам
яркости) с морфящимися волновыми полосами; опционально вырезанный текст
(`text`), вокруг которого текут волны. Вдохновлено vercel.com/labs.

## Когда использовать

Фон с логотипом или коротким словом/символом (`</>`, название продукта):
девтулы, лаборатории, анонсы. Не брать без поддержки WebGPU в рендере.

## Фразы из озвучки

- «код — в основе всего»
- «добро пожаловать в лабораторию»
- «наш продукт — в центре экосистемы»

## Визуальный стиль

Серые глифы (`#929292`) на тёмном, белые вспышки в «брызгах», свечение.

## Входные данные

`text = ''`, `fontFamily = 'Geist, "Geist Sans", system-ui, sans-serif'`,
`fontWeight = 500`, `textSize = 0.6`, `shapes = 'mixed'`
(`squares|circles|triangles`), `cellSize = 10`, `dotSize = 0.75`,
`color = '#929292'`, `hoverColor = '#ffffff'`, `backgroundColor = '#000000'`,
`speed = 1`, `scale = 1`, `contrast`, `brightness`, `flow`, `direction`,
`fade`, `interactive`, `splashRadius`, `splashStrength`, `glow`, `intro`,
`introDuration`, `paused` (значения из usage: 1, 0.4, 0, 0, 0.25, true, 40,
0.4, 0.35, true, 1.6, false).

## Анимации

Пакет `vgpu` (`init`, `surface`, `frame`, `effect`, `storage`, `target`):
GPU-симуляция волн с фиксированным шагом `SIMULATION_STEP = 1/60`, брызги
от курсора, интро.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/ShapeWaves/ShapeWaves.jsx` (+ `ShapeWaves.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/ShapeWaves/ShapeWaves.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/ShapeWavesDemo.jsx`

## Зависимости

`vgpu`

## Совместимость и адаптация

`complex`: свой цикл `frame` из `vgpu` и накопительная симуляция. Нужна
поддержка бэкенда `vgpu` в headless Chrome (по именам API — WebGPU; не
проверено). Рецепт R1/R6 в `compatibility/react-bits.md`.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
