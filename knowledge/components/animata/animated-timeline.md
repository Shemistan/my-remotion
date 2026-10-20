# AnimatedTimeline — `animata/animated-timeline`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Вертикальный таймлайн: точки-кружки на линии и справа заголовок, описание,
дата. При активации пункта N точки 0…N заливаются цветом и чуть
увеличиваются, линия между ними «наливается» сверху вниз каскадом.

## Когда использовать

История компании, этапы проекта, roadmap, шаги процесса — с подсветкой
«дошли до этапа N». Анимация в оригинале от hover; в видео активный пункт
двигать по кадру.

## Фразы из озвучки

- «в 2019 мы начали, в 2021 вышли на рынок»
- «этап за этапом»
- «сейчас мы здесь»

## Визуальный стиль

Чистый, светлый; по умолчанию серый `#d1d5db` и зелёный `#22c55e`, точки
1.5rem с рамкой 4px, заголовок `text-lg font-semibold`.

## Входные данные

Default export `AnimatedTimelinePage`: `events?: TimelineEvent[]`
(`{id, title, description?, date?, ...}`; по умолчанию 3 события 2023),
`title?` (`"Timeline"`), `containerClassName?`, `timelineStyles?:
Partial<TimelineStyles>` (`lineColor, activeLineColor, dotColor,
activeDotColor, dotSize, titleColor, activeTitleColor, descriptionColor,
dateColor`), `customEventRender?`, `onEventHover?`, `onEventClick?`,
`initialActiveIndex?`. Именованный `AnimatedTimeline` — без заголовка.

## Анимации

CSS-transition: точка 0.12 с (цвет, `scale(1.2)`), линия `scaleY 0→1` 0.15 с
от `top`; задержки `computeDelays`: `STAGGER 0.08`, `LINE_OFFSET 0.04`,
каскад вниз при росте и вверх при откате.

## Исходники и документация

- `templates/react-libriry/animata/animata/progress/animatedtimeline.tsx` — компонент
- `templates/react-libriry/animata/content/docs/progress/animatedtimeline.mdx` — документация
- `templates/react-libriry/animata/animata/progress/animatedtimeline.stories.tsx` — пример

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

Убрать hover; `active = floor(interpolate(frame, …))` (или по таймкодам
озвучки); заливку точки i и линии считать из кадра: `p_i =
interpolate(frame − t_i, [0, 4], [0, 1])` вместо transitionDelay.
`initialActiveIndex` уже даёт статичный кадр.

## Паттерны

`timeline`, `sequence-steps`
