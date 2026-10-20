# BounceCards — `react-bits/bounce-cards`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `dom`, `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Веер фото-карточек в белой рамке, которые по очереди «выпрыгивают» из нуля
с упругим отскоком и раскладываются с наклонами; при наведении соседи
раздвигаются, а выбранная выпрямляется и увеличивается.

## Когда использовать

«Вот наша команда», «несколько кадров из поездки», подборка примеров,
галерея из 3–7 фото с игривым появлением.

## Фразы из озвучки

- «Знакомьтесь, это наша команда»
- «Несколько кадров с прошлого мероприятия»
- «Пять историй, которые нас вдохновили»

## Визуальный стиль

Квадратные карточки 200px, рамка 5px `#ffffff`, радиус 25px, тень;
наклоны по шаблону `[1, 0.5, -0.3, -1, …]·rotation`; игриво, «полароид».

## Входные данные

`images` (строки или `{src, alt}`), `className`, `style`,
`containerWidth=400`, `containerHeight=400`, `cardSize=200`, `spread=85`,
`rotation=10`, `arc=0`, `animationDelay=0.5`, `animationStagger=0.06`,
`bounciness=0.6`, `enableHover=true`, `pushDistance=160`, `hoverScale=1.06`,
`borderWidth=5`, `borderColor='#ffffff'`, `radius=25`, `shadow=true`,
`transformStyles` (строки `rotate(…) translate(…)` на карточку), `onCardClick`.

## Анимации

Собственный пружинный интегратор в rAF: scale 0→1 появляется у карточки `i`
после `animationDelay + i*animationStagger`, затухание пружины задаёт
`bounciness`; позиции слотов `x = (i - middle)*spread`, `y = arc*(…)²` —
чистая функция; hover сдвигает соседей на `pushDistance`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/BounceCards/BounceCards.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/BounceCards/BounceCards.css` — стили карточек
- `templates/react-libriry/react-bits/src/ts-default/Components/BounceCards/BounceCards.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/BounceCardsDemo.jsx` — демо
- https://reactbits.dev/components/bounce-cards

## Зависимости

Нет внешних пакетов (React + CSS).

## Совместимость и адаптация

`adaptable`: интро — обычная пружина со stagger. Рецепт: для карточки `i`
`scale = spring({frame: frame - (animationDelay + i*animationStagger)*fps, fps,
config: {stiffness: 170, damping: 2*(1-0.85*bounciness)*sqrt(170)}})`,
`transform` слота считать в рендере (inline вместо записи через ref).
Hover-раздвигание можно воспроизвести сценарно (индекс «выбранной» по кадру
+ spring). rAF и обработчики убрать; картинки — `Img` + `staticFile`.

## Паттерны

`sequence-steps`, `comparison`
