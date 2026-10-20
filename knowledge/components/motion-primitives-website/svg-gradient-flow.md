# SvgGradientFlow — `motion-primitives-website/svg-gradient-flow`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `icons-shapes` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `svg`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

SVG-фигуры или текст, по которым непрерывно течёт многоцветный
линейный градиент (горизонтально, вертикально или по диагонали).

## Когда использовать

«Поток энергии/данных» по линии или иконке, переливающийся логотип,
акцентная SVG-надпись.

## Фразы из озвучки

- «энергия течёт по всей системе»
- «данные движутся по каналам»
- «яркий, живой бренд»

## Визуальный стиль

Цвета по умолчанию `#8b5cf6 → #ec4899 → #06b6d4 → #8b5cf6`;
`gradientUnits="userSpaceOnUse"`, ширина градиента 200 %; полный цикл
4 с / `speed`.

## Входные данные

`SvgGradientFlowProps`: `children`; `colors?`; `speed?` (1);
`direction?: 'horizontal'|'vertical'|'diagonal'` (`'horizontal'`);
`trigger?: 'auto'|'scroll'` (`'auto'`); `viewBox?`, `width?`, `height?`;
`className?`.

## Анимации

GSAP `offset 0 → -100` (repeat -1, linear) → `x1 = offset%`,
`x2 = offset + 200%` у `linearGradient` через `setAttribute`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/svg/animated-svg.tsx` — компонент

## Зависимости

`gsap`, `gsap/ScrollTrigger`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `offset = -100 * ((frame/fps) % (4/speed)) / (4/speed)`,
`x1/x2` (или `y1/y2`) — атрибутами в JSX; GSAP удалить. Замечание: в
`userSpaceOnUse` проценты считаются от вьюпорта SVG — проверить, что
градиент покрывает фигуры.

## Паттерны

`relationships`, `key-point-emphasis`
