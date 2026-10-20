# Particles — `react-bits/particles`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

3D-облако частиц (круги, квадраты, кольца, искры), медленно дрейфующих
(`none|up|down|forward`) с мерцанием и свечением; опционально соединения
линиями (до 900 связанных частиц, 9000 линий); курсор — параллакс,
отталкивание или притяжение.

## Когда использовать

Универсальный «космос/пыль/звёзды», сеть связей, фон для интро и титров.

## Фразы из озвучки

- «миллионы возможностей вокруг нас»
- «каждая точка — это клиент»
- «всё связано со всем»

## Визуальный стиль

Белые точки (`particleColors = ['#ffffff']`) с glow на тёмном, спокойно.

## Входные данные

Из usage: `particleColors = ['#ffffff']`, `particleCount = 200`,
`particleSpread = 10`, `speed = 0.1`, `particleBaseSize = 100`,
`glow = 0.5`, `twinkle = 0.3`, `moveParticlesOnHover`,
`hoverEffect = 'parallax'` (`parallax|repel|attract`). Формы `SHAPES`,
дрейф `DRIFTS`; до 20000 частиц. Остальное — PropTable демо.

## Анимации

Сырой WebGL2, движение и мерцание в шейдере по времени из rAF, до 4
«вспышек» от клика.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Particles/Particles.jsx` (+ `Particles.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Particles/Particles.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/ParticlesDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1, `moveParticlesOnHover={false}`; если позиции частиц
генерируются через `Math.random` — заменить на `random(seed)` (не сверено
построчно).

## Паттерны

`quantities`, `relationships`, `abstract-concepts`
