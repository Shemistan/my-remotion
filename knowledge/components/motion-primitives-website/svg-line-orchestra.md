# SvgLineOrchestra — `motion-primitives-website/svg-line-orchestra`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `icons-shapes` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `svg`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Все `path` внутри SVG прорисовываются строго по очереди с шагом 0.3 с —
«хореография» линий (только `path`, в отличие от `svg-path-draw`).

## Когда использовать

Схема, карта, чертёж или иллюстрация, которые собираются линия за линией
под рассказ; каждая линия — новый шаг мысли.

## Фразы из озвучки

- «сначала один элемент, затем второй»
- «собираем картину по частям»
- «линия за линией складывается схема»

## Визуальный стиль

`fill="none"`, цвета из детей; `power3.out`, 1 с на линию.

## Входные данные

`SvgLineOrchestraProps`: `children` (path); `trigger?: 'mount'|'scroll'|
'inView'` (`'inView'`); `stagger?` (0.3); `duration?` (1); `ease?`
(`'power3.out'`); `viewBox?`, `width?`, `height?`; `className?`.

## Анимации

`gsap.timeline({paused})`, для `path` `i` — `strokeDashoffset len → 0`
на позиции `i*stagger`; запуск по mount / ScrollTrigger (scrub 1 или
once).

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/svg/animated-svg.tsx` — компонент

## Зависимости

`gsap`, `gsap/ScrollTrigger`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: timeline тривиальный (линейная раскладка по индексу) —
переписывается без GSAP: `pathLength={1}`, `strokeDasharray 1`,
`strokeDashoffset = 1 - p_i`,
`p_i = interpolate(frame, [s + i*stagger*fps, s + (i*stagger + duration)*fps], [0,1], {clamp, easing: Easing.out(Easing.cubic)})`.

## Паттерны

`sequence-steps`, `system-structure`
