# AnimatedBeam — `motion-primitives-website/animated-beam`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `dom`, `svg`, `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Светящаяся линия-связь между двумя элементами страницы (квадратичная
кривая): по бледному пути бегут штрихи градиента — «данные текут от A к
B». `BeamCircle` — круглый узел-иконка для концов.

## Когда использовать

Схемы интеграций: «источники → платформа → приёмники», поток данных
между сервисами, связи между узлами. Версия из
`effects/premium-effects.tsx` — отдельный компонент, в эту запись не
входит.

## Фразы из озвучки

- «данные поступают из всех источников в одну платформу»
- «сервисы обмениваются информацией»
- «всё соединено в единую систему»

## Визуальный стиль

Фон-путь `gray`, ширина 2, opacity 0.2; градиент от `hsl(var(--primary))`
к `hsl(var(--accent))`, `strokeDasharray 16 32`; изгиб `curvature`.

## Входные данные

`AnimatedBeamProps`: `containerRef`, `fromRef`, `toRef`
(`RefObject<HTMLDivElement>`); `curvature?` (0); `reverse?` (false);
`duration?` (`Math.random()*3 + 4`); `delay?` (0); `pathColor?`
(`'gray'`); `pathWidth?` (2); `pathOpacity?` (0.2);
`gradientStartColor?`, `gradientStopColor?`; `startXOffset?`,
`startYOffset?`, `endXOffset?`, `endYOffset?` (0); `className?`.

## Анимации

Координаты концов — `getBoundingClientRect` трёх элементов +
`ResizeObserver`; движение штрихов — SVG SMIL `<animate
attributeName="stroke-dashoffset" repeatCount="indefinite">`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/animated-beam.tsx` — компонент (+ `BeamCircle`)

## Зависимости

`react`, `@/lib/utils` (framer-motion импортирован, не используется).

## Совместимость и адаптация

`complex`: геометрия берётся измерением DOM, анимация — SMIL по часам
документа, `duration` и id — `Math.random`. Кроме того, второй
(градиентный) путь берёт `d` из `pathRef.current` при рендере — на
первом рендере он пуст. Переработка: координаты узлов задать явно
(раскладка сцены известна) или измерить один раз под `delayRender`;
`d` считать в рендере; `<animate>` убрать,
`strokeDashoffset = (reverse ? 1 : -1) * 48 * (frame/fps - delay)/duration`;
`duration` и id — детерминированные.

## Паттерны

`relationships`, `system-structure`, `cause-effect`
