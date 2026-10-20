# TextLoop — `react-bits/text-loop`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `svg`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Цветная лента-ленточка (`ribbon`) с бегущим по ней текстом вдоль SVG-кривой:
волна, арка, круг, бесконечность, прямая или свой `path`; опционально вторая
лента крест-накрест (X) с мягкой тенью, контурные буквы, затухание краёв.

## Когда использовать

Промо-ленты «SALE / NEW / LIVE», энергичная заставка, разделитель между
блоками, бренд-лента поверх кадра. Для текста по дуге без ленты —
`react-bits/curved-loop`.

## Фразы из озвучки

- «Новая коллекция уже в продаже»
- «Прямой эфир начинается прямо сейчас»
- «Без перерывов и выходных»

## Визуальный стиль

Фиолетовая лента `#5227FF` шириной 86, белый 46px/800 текст в верхнем
регистре с разделителем «✦»; 90 px/с — бодро, «стритвир/промо».

## Входные данные

`text='React ✦ Bits'`, `shape='wave'` (`wave|arch|circle|infinity|line`), `path`,
`speed=90`, `direction='forward'` (`forward|reverse`), `separator='✦'`,
`curviness=90`, `tilt=0`, `fontSize=46`, `fontWeight=800`, `letterSpacing=2`,
`uppercase=true`, `color`, `ribbon=true`, `ribbonColor='#5227FF'`,
`ribbonWidth=86`, `edgeFade=0`, `pauseOnHover=true`, `cross=false`,
`crossColor`, `crossAngle=16`, `draggable=false`, `scrollBoost=0`,
`outline=false`, `outlineWidth=1.5`, `className`, `style`.

## Анимации

`gsap.ticker` продвигает `travel += v*dt`; `startOffset` двух `<textPath>`
(голова/хвост) = `wrap(travel, length)` и `offset - length`, вторая лента —
в обратную сторону; hover плавно гасит скорость (`gsap.to`), drag/fling и
скролл добавляют скорость. Длина пути — `getTotalLength`, число повторов —
по `getComputedTextLength`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/TextLoop/TextLoop.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/TextLoop/TextLoop.css` — контейнер
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/TextLoop/TextLoop.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/TextLoopDemo.jsx` — демо
- https://reactbits.dev/text-animations/text-loop

## Зависимости

`gsap` (только ticker и tween hover).

## Совместимость и адаптация

`adaptable`: `travel = speed * sign * frame / fps`, `offset = wrap(travel, length)`
→ `startOffset` головы `offset`, хвоста `offset - length`, креста
`wrap(-travel, crossLength)`; писать прямо в JSX. Метрики измерить один раз
после шрифта (`delayRender`). `gsap.ticker`, hover, drag и `scrollBoost`
убрать (`pauseOnHover` в видео не срабатывает, но лучше передать `false`).

## Паттерны

`key-point-emphasis`, `transformation`
