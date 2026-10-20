# CircularText — `react-bits/circular-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `raf`, `dom`, `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Текст, разложенный по кругу и медленно вращающийся, как бейдж-печать;
опционально — внутренняя окружность, иконка/логотип в центре, наклон в 3D
(«орбита планеты»), несколько повторов текста по кругу.

## Когда использовать

Бейдж «новинка/скидка», печать качества, логотип с подписью по кругу,
циклы и «круговорот». Для текста вдоль произвольной кривой — `react-bits/curved-loop`
или `react-bits/text-loop`.

## Фразы из озвучки

- «Гарантия качества — сто процентов»
- «Круглосуточно, без выходных»
- «Всё повторяется по кругу»

## Визуальный стиль

Жирный `900`, `24px`, кольцо `200px`; оборот за 20 с — спокойно и
«брендово». Цвет и кольцо — через `color`/`ringColor`.

## Входные данные

`text`, `spinDuration=20` (с на оборот), `onHover='speedUp'`
(`slowDown|speedUp|pause|goBonkers`), `direction='clockwise'`, `size=200`,
`fontSize=24`, `fontWeight=900`, `letterSpacing=0`, `color=''`,
`startAngle=0`, `fill=true` (равномерно по кругу; `false` — по ширине глифов),
`repeat=1`, `ring=false`, `ringColor=''`, `tilt=0`, `hoverTilt=0`,
`draggable=false`, `children` (центр), `className`.

## Анимации

Цикл `frame.update` из motion (rAF): `rotation += (360/spinDuration) * dt`
(+ инерция после броска); hover меняет скорость пружиной; ширины глифов
меряются `offsetWidth` при `fill=false`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/CircularText/CircularText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/CircularText/CircularText.css` — раскладка букв
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/CircularText/CircularText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/CircularTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/circular-text

## Зависимости

`motion` (`frame`, `cancelFrame`, `motion`, `useMotionValue`, `useSpring`).

## Совместимость и адаптация

`adaptable`: раскладка букв статична (`rotate(angle_i)`), движение — только
угол кольца. Рецепт: `rotate = (frame / fps) * 360 / spinDuration * dir`
в style `.circular-text__ring`; убрать `frame.update`, hover/drag, пружины
tilt/scale; CSS-transition у `.circular-text__letter` отключить
(`data-settled` не ставить). При `fill=false` шрифт загрузить через `delayRender`.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
