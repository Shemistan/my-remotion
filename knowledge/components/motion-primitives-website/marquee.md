# Marquee — `motion-primitives-website/marquee`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Бесконечная бегущая лента (горизонтальная или вертикальная): контент
повторён `repeat` раз и бесшовно сдвигается; `MarqueeItem` —
полупрозрачная карточка-плашка.

## Когда использовать

Лента логотипов клиентов, отзывы, технологии, теги. В отличие от
`motion-primitives/infinite-slider`, измерения DOM не нужны — сдвиг
задан в процентах.

## Фразы из озвучки

- «нам доверяют ведущие компании»
- «поддерживаем все популярные технологии»
- «тысячи довольных клиентов»

## Визуальный стиль

`flex overflow-hidden`, `gap` px; `MarqueeItem`: `rounded-xl border
bg-surface/60 backdrop-blur-sm px-6 py-4` (переменные темы).

## Входные данные

`MarqueeProps`: `children`; `reverse?` (false); `pauseOnHover?` (false);
`vertical?` (false); `repeat?` (4); `speed?` (40 — секунд на цикл, не
скорость); `gap?` (16); `className?`. `MarqueeItem`: `children`,
`className?`.

## Анимации

Tailwind `animate-marquee` / `-reverse` / `-vertical` (keyframes в
`tailwind.config.ts`: `translateX(0) → translateX(calc(-100% -
var(--gap)))`, `--duration`).

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/marquee.tsx` — компонент (+ `MarqueeItem`)
- `templates/react-libriry/motion-primitives-website/tailwind.config.ts` — keyframes `marquee*`

## Зависимости

`tailwindcss` (+ keyframes из конфига), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: класс анимации убрать, у каждой копии
`transform: translateX(calc(${-100*u}% - ${gap*u}px))`,
`u = ((frame/fps) / speed) % 1` (для reverse — `1 - u`). `pauseOnHover`
не использовать.

## Паттерны

`quantities`, `relationships`
