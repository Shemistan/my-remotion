# LaserFlow — `react-bits/laser-flow`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Вертикальный лазерный луч, падающий на «поверхность» (карточку/UI по
`surfaceRef`): вспышка в точке удара, разлив света, туман и пыль;
вокруг курсора может проявляться картинка (`revealImage`).

## Когда использовать

Герой-кадр продукта: «луч света на интерфейс», запуск, AI «сканирует».

## Фразы из озвучки

- «весь свет — на наш продукт»
- «точка, где всё начинается»
- «лазерная точность»

## Визуальный стиль

Синий лазер (`#3847ff`), вспышка 1.5, туман 0.2, пыль 1.6.

## Входные данные

Из usage: `surfaceRef`, `beamPosition = 0.6`, `color = '#3847ff'`,
`intensity = 1.8`, `flare = 1.5`, `spread = 1.5`, `spill = 1`, `fog = 0.2`,
`dust = 1.6`, `revealImage`, `revealRadius = 220`, `revealOpacity = 0.6`.

## Анимации

WebGL2-шейдер, мерцание луча и пыль по времени (rAF); геометрия
поверхности — измерение DOM-элемента по `surfaceRef`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/LaserFlow/LaserFlow.jsx` (+ `LaserFlow.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/LaserFlow/LaserFlow.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/LaserFlowDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; `surfaceRef` работает (DOM есть), но размеры кадра
фиксированы — проще передать прямоугольник явно; `revealImage` через
`staticFile`, проявление у курсора выключить.

## Паттерны

`key-point-emphasis`, `cause-effect`
