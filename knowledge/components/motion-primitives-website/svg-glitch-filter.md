# SvgGlitchFilter — `motion-primitives-website/svg-glitch-filter`

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

Обёртка, накладывающая на любое содержимое (текст, картинку) глитч:
шумовое смещение пикселей (`feTurbulence` + `feDisplacementMap`) с
резкими всплесками и RGB-раздвоением.

## Когда использовать

Сбой, взлом, «ошибка в системе», киберпанк, переход между сценами через
помехи, акцент на «фейке» или опасности.

## Фразы из озвучки

- «и тут система дала сбой»
- «что-то пошло не так»
- «реальность начинает искажаться»

## Визуальный стиль

`fractalNoise`, 3 октавы; масштаб смещения ~`intensity`, в 10 % кадров
всплеск до ×3; цветовой сдвиг ±2 px с `screen`.

## Входные данные

`SvgGlitchFilterProps`: `children`; `intensity?` (20); `speed?` (1);
`active?` (true); `colorShift?` (true); `className?`.

## Анимации

`requestAnimationFrame`: `t += 0.05*speed`; `baseFrequency` и `seed`
турбулентности, `scale` смещения — с `Math.random()` на каждом кадре.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/svg/animated-svg.tsx` — компонент

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: атрибуты считать в рендере по кадру —
`t = frame*0.05*speed*(60/fps)`,
`freq = 0.01 + sin(t)*0.005 + random(\`gf-${frame}\`)*0.01`,
`seed = floor(random(\`gs-${frame}\`)*100)`, `scale` — по той же схеме с
`random(\`gd-${frame}\`)`; rAF и `setAttribute` удалить. CSS
`filter: url(#id)` на HTML работает в Chromium; фильтр тяжёлый —
проверить время рендера.

## Паттерны

`cause-effect`, `transformation`
