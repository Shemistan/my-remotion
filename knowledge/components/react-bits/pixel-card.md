# PixelCard — `react-bits/pixel-card`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Карточка, которая заполняется мерцающими пикселями (квадраты, круги или
ромбы): волна раскрытия идёт от центра (или курсора) с вспышкой на фронте,
затем пиксели переливаются; мягкое свечение и затухание к центру.

## Когда использовать

Цифровое «оживание» карточки, пиксельная магия, загрузка/материализация
данных, фоны для CTA. В видео — режим `trigger='always'` или интро.

## Фразы из озвучки

- «Данные оживают прямо на глазах»
- «Цифровая трансформация в действии»
- «Каждый пиксель имеет значение»

## Визуальный стиль

Пресеты `default` (серо-белый), `blue`, `yellow`, `pink` с разным шагом
сетки (3–10px) и скоростью мерцания; радиус 24px; тёмная/светлая тема.

## Входные данные

`variant='default'` (`default|blue|yellow|pink`), `colors`, `gap`, `speed`
(0–100, из пресета), `pixelSize=2`, `shape='square'` (`square|circle|diamond`),
`origin='center'` (`center|pointer`), `revealDuration=600`, `spotlight=0.5`,
`glow=0.5`, `glowColor`, `opacity=1`, `fade=0`, `trigger='hover'`
(`hover|click|always`), `clickPulse=true`, `intro=true`, `introDelay=0`,
`noFocus`, `theme='dark'`, `radius=24`, `className`, `style`, `children`.

## Анимации

2D-canvas в rAF: у каждого пикселя задержка появления
`distance*span*0.82 + jitter*span*0.18`, затем presence растёт линейно за
0,26 с с `easeOutBack` размера и вспышкой; мерцание
`sin(phase + time*frequency*rate)`; параметры пикселей — `Math.random`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/PixelCard/PixelCard.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/PixelCard/PixelCard.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/PixelCard/PixelCard.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/PixelCardDemo.jsx` — демо
- https://reactbits.dev/components/pixel-card

## Зависимости

Нет внешних пакетов (React + Canvas 2D).

## Совместимость и адаптация

`complex` (Canvas), но перенос прямой: все величины выражаются через время.
Рецепт: `time = frame/fps`; `presence_i = clamp((time - introDelay - delay_i)/0.26, 0, 1)`
вместо накопления; `Math.random` при построении сетки → `random(\`px-${i}\`)`;
`draw()` вызывать в `useLayoutEffect` на каждый кадр (canvas размером
композиции, без `ResizeObserver`). Hover/spotlight/pulse убрать или вести
сценарно.

## Паттерны

`transformation`, `abstract-concepts`
