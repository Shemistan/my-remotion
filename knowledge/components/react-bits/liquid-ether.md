# LiquidEther — `react-bits/liquid-ether`

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

Симуляция жидкости/дыма: цветные струи, закручивающиеся в вихри за
курсором; при `autoDemo` «виртуальный курсор» водит сам.

## Когда использовать

Креатив, текучесть, «идеи смешиваются», плавные переходы. Есть
автодемо — пригоден и без указателя.

## Фразы из озвучки

- «идеи перетекают друг в друга»
- «творчество не знает границ»
- «всё в движении»

## Визуальный стиль

Палитра `['#5227FF', '#FF9FFC', '#B497CF']` на тёмном, мягкие вихри.

## Входные данные

Из usage: `colors`, `mouseForce = 20`, `cursorSize = 100`,
`persistence = 0.75`, `autoDemo = true`, `autoSpeed = 0.5`,
`autoIntensity = 2.2`. Остальное — PropTable демо.

## Анимации

WebGL2 (без библиотек), симуляция жидкости с накоплением состояния между
кадрами (`persistence`), rAF; детали солвера построчно не сверены.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/LiquidEther/LiquidEther.jsx` (+ `LiquidEther.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/LiquidEther/LiquidEther.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/LiquidEtherDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`, одна из самых трудных: состояние жидкости накапливается.
Рецепт R3 — прогон симуляции с фиксированным шагом от 0 до кадра
(дорого) или рендер последовательно одним потоком (`--concurrency=1`) с
проверкой порядка кадров; автодемо-траекторию сделать функцией времени.

## Паттерны

`transformation`, `relationships`
