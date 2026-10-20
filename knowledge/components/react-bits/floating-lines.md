# FloatingLines — `react-bits/floating-lines`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Три группы плавающих светящихся линий (верх, середина, низ), изогнутых
волнами с градиентом цвета; клик закручивает.

## Когда использовать

Лёгкий элегантный фон под заголовок, «плавно и непрерывно», музыка.

## Фразы из озвучки

- «всё течёт и меняется»
- «плавный путь к цели»
- «три направления — одна стратегия»

## Визуальный стиль

Градиент линий `#e945f5` → `#ffffff` на тёмном.

## Входные данные

Из usage: `linesGradient = ['#e945f5', '#ffffff']`,
`enabledWaves = ['top', 'middle', 'bottom']`, `lineCount = 10`,
`lineDistance = 6`, `bendStrength = -0.5`, `interactive`, `clickSwirl`.
До 24 линий (`MAX_LINES`).

## Анимации

WebGL2 (без библиотек), волны по времени (rAF), изгиб к курсору, вихрь от клика.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/FloatingLines/FloatingLines.jsx` (+ `FloatingLines.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/FloatingLines/FloatingLines.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/FloatingLinesDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1, `interactive={false}`, `clickSwirl={false}`.

## Паттерны

`abstract-concepts`, `relationships`
