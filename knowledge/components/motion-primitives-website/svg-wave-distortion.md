# SvgWaveDistortion — `motion-primitives-website/svg-wave-distortion`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Обёртка, через которую содержимое колышется, как сквозь воду или
горячий воздух (`feTurbulence type="turbulence"` + смещение).

## Когда использовать

Мираж, сон, воспоминание, «под водой», жара; мягкий переход-искажение.
Спокойнее, чем `svg-glitch-filter`.

## Фразы из озвучки

- «как будто во сне»
- «вспомним, как всё начиналось»
- «жара плавит асфальт»

## Визуальный стиль

3 октавы турбулентности; `intensity` 15 px; частота дышит по синусу
±50 %.

## Входные данные

`SvgWaveDistortionProps`: `children`; `intensity?` (15); `frequency?`
(0.02); `speed?` (1); `active?` (true); `className?`.

## Анимации

`requestAnimationFrame`: `t += 0.01*speed`,
`baseFrequency = f + sin(t)*f*0.5` (по y — половина).

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/svg/animated-svg.tsx` — компонент

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `t = frame*0.01*speed*(60/fps)`, `baseFrequency` записать
атрибутом в JSX; rAF удалить. Детерминировано (нет `Math.random`).

## Паттерны

`transformation`, `abstract-concepts`
