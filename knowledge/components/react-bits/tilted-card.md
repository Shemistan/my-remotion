# TiltedCard — `react-bits/tilted-card`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

3D-карточка с изображением, наклоняющаяся в перспективе, с бликом-glare,
мягкой тенью на «полу», параллакс-слоями (`TiltedCardLayer`) и оборотной
стороной (переворот на 180°). Режим `floating` — сама плавно покачивается.

## Когда использовать

Обложка альбома, постер, билет, карточка продукта/книги, «вот наш новый
релиз». Для голографической фольги — `react-bits/holo-card`.

## Фразы из озвучки

- «Встречайте обложку нового альбома»
- «Ваш билет на конференцию уже здесь»
- «Переворачиваем карточку — и видим детали»

## Визуальный стиль

Картинка 300×300, радиус 15px, перспектива 800, амплитуда наклона 12°,
белый блик, тень снизу; дорогой «продуктовый» вид.

## Входные данные

`imageSrc`, `altText`, `captionText=''`, `containerHeight='300px'`,
`containerWidth='100%'`, `imageHeight='300px'`, `imageWidth='300px'`,
`scaleOnHover=1.05`, `rotateAmplitude=12`, `showTooltip=true`,
`overlayContent`, `displayOverlayContent=false`, `overlayDepth=30`, `children`,
`backContent`, `flipOnClick=true`, `flipped`, `onFlip`, `radius=15`,
`perspective=800`, `smoothness=0.6`, `glare=0.5`, `glareColor='#ffffff'`,
`shadow=0.5`, `parallax=1`, `axis='both'` (`both|horizontal|vertical`),
`reverse=false`, `trackWindow=false`, `floating=false`, `gyroscope=true`,
`intro=true`, `introDelay=0`, `onClick`, `className`, `style`.

## Анимации

rAF с самописными пружинами (`step(ω, ζ)`) для `rx/ry/lift/ty/flip`; цель
наклона — курсор, гироскоп или при `floating` сумма синусов
(`0.32·sin(0.62t)+0.12·sin(1.31t+0.7)` и т.п.); интро — карточка из
`rx=16°, ty=22px, opacity 0` встаёт на место; переворот — пружина к 180°.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/TiltedCard/TiltedCard.jsx` — компонент и `TiltedCardLayer`
- `templates/react-libriry/react-bits/src/content/Components/TiltedCard/TiltedCard.css` — стили, glare, слои
- `templates/react-libriry/react-bits/src/ts-default/Components/TiltedCard/TiltedCard.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/TiltedCardDemo.jsx` — демо
- https://reactbits.dev/components/tilted-card

## Зависимости

Нет внешних пакетов (React + CSS 3D).

## Совместимость и адаптация

`adaptable` в режимах `intro` + `floating` (+ сценарный flip). Рецепт:
`t = frame/fps`; `rx = -inputY*amp`, `ry = inputX*amp` по формулам floating;
интро — `spring()` от 16°/22px к 0, `opacity` по smootherstep; flip —
`spring()` к 180° на нужном кадре; CSS-переменные `--tc-px/--tc-py/--tc-gx/--tc-gy/--tc-glare`
и тень считать в рендере. Стартовая фаза `Math.random()*10` → константа.
Курсор, гироскоп, tooltip убрать.

## Паттерны

`key-point-emphasis`, `spatial`
