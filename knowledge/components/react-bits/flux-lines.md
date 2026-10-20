# FluxLines — `react-bits/flux-lines`

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

Светящиеся линии потока с ярким ободком, текущие в заданном направлении
(`flowDirection`), как силовые линии поля; клик закручивает вихрь.

## Когда использовать

Поток данных/энергии, «всё течёт в одну сторону», направление движения.

## Фразы из озвучки

- «поток данных не останавливается»
- «энергия направлена вниз, к основанию»
- «всё движется в одном направлении»

## Визуальный стиль

Белые линии с glow 2 и ободком 0.2 на тёмном.

## Входные данные

Из usage: `colors = ['#ffffff', '#ffffff', '#ffffff']` (до 8), `glow = 2`,
`rimWidth = 0.2`, `lineWidth = 1`, `flowDirection = 'down'`,
`mouseInteraction`, `clickSwirl`.

## Анимации

WebGL2 (импортов нет), течение по времени (rAF), вихрь от клика.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/FluxLines/FluxLines.jsx` (+ `FluxLines.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/FluxLines/FluxLines.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/FluxLinesDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1, `mouseInteraction={false}`, `clickSwirl={false}`.

## Паттерны

`cause-effect`, `sequence-steps`
