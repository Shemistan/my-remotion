# GhostFibers — `react-bits/ghost-fibers`

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

Несколько закрученных «лент» из светящихся волокон (точки, штрихи или
линии) в 3D-перспективе, с bloom и глубиной резкости.

## Когда использовать

Абстрактный фон для связей, нейросетей, потоков данных, «нитей» судьбы
продукта. Не брать под мелкий текст — много свечения.

## Фразы из озвучки

- «тысячи связей сплетаются в одну сеть»
- «нити ведут к одной цели»
- «так рождается интеллект»

## Визуальный стиль

Фиолетовое свечение (`glowColor = '#8b5cf6'`), тёмный фон, мягкий bloom.

## Входные данные

Из usage: `glowColor = '#8b5cf6'`, `layers = 3`, `twist = 1.2`,
`threads = 72`, `fiberStyle = 'dots'` (`dots|dashes|lines`),
`depthOfField = 0.85`, `hoverEffect = 'focus'` (`focus|part|none`),
`intro = true`, `mouseInteraction = true`. Есть градиенты `depth|along|across`
(константа `GRADIENTS`); полный список — PropTable демо.

## Анимации

Сырой WebGL2, bloom 5 уровней, интро 2.6 с, время в rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/GhostFibers/GhostFibers.jsx` (+ `GhostFibers.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/GhostFibers/GhostFibers.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/GhostFibersDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1, `hoverEffect = 'none'`, `intro={false}` или интро по
кадру.

## Паттерны

`relationships`, `abstract-concepts`
