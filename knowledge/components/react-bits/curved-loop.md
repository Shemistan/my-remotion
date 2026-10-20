# CurvedLoop — `react-bits/curved-loop`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Бегущая строка, текст которой течёт вдоль кривой: дуга (`arc`), волна,
прямая или замкнутое кольцо; опционально контурные буквы, акцентный
разделитель между повторами и мягкое затухание по краям.

## Когда использовать

Динамичная «лента» с лозунгом или ключевыми словами через весь кадр:
промо, интро, переход между блоками. Для кругового бейджа — `react-bits/circular-text`,
для ленты-ленточки с крестом — `react-bits/text-loop`.

## Фразы из озвучки

- «Скорость, гибкость, масштаб — без остановки»
- «Всё это работает в одном потоке»
- «Движение не прекращается ни на секунду»

## Визуальный стиль

Крупный (96px), жирный (700), в верхнем регистре (CSS `text-transform`);
цвет `currentColor`; плавно и ритмично, «постерно».

## Входные данные

`marqueeText=''`, `speed=2` (×60 px/с), `className`, `curveAmount=400`,
`direction='left'` (`left|right`), `interactive=true` (drag), `pauseOnHover=false`,
`color='currentColor'`, `edgeFade=0`, `shape='arc'` (`arc|wave|line|circle`),
`fontSize=96`, `fontWeight=700`, `letterSpacing=0`, `outline=false`,
`separator=''`, `separatorColor`, `scrollBoost=0`.

## Анимации

SVG `<textPath>`; rAF сдвигает `startOffset` на `velocity*dt`, обёрнутый по
длине одной копии (`wrapOffset`); скорость к целевой подходит экспоненциально;
drag/fling и ускорение от скролла добавляются к скорости.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/CurvedLoop/CurvedLoop.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/CurvedLoop/CurvedLoop.css` — раскладка (min-height: 100vh у обёртки)
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/CurvedLoop/CurvedLoop.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/CurvedLoopDemo.jsx` — демо
- https://reactbits.dev/text-animations/curved-loop

## Зависимости

Нет внешних пакетов (React + SVG).

## Совместимость и адаптация

`adaptable`: смещение — функция времени. Рецепт:
`startOffset = wrapOffset(sign * speed * 60 * frame / fps, spacing)` прямо в
JSX `<textPath startOffset>`; `spacing` (`getComputedTextLength`) и длину пути
измерить один раз после загрузки шрифта (`delayRender`). Убрать rAF,
`IntersectionObserver`, drag, hover и `scrollBoost`. Обёртке
`.curved-loop-jacket` снять `min-height: 100vh`.

## Паттерны

`key-point-emphasis`, `transformation`
