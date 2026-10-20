# ShineBorder — `magicui/shine-border`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Рамка карточки, по которой медленно переливается радиальный блик
(один или несколько цветов) — мягкое сияние контура.

## Когда использовать

Выделить карточку/окно спокойнее, чем `border-beam`: премиум-тариф,
«особое предложение», рамка вокруг скриншота.

## Фразы из озвучки

- «особое предложение для вас»
- «премиальный уровень»
- «обратите внимание на эту карточку»

## Визуальный стиль

Радиальный градиент `shineColor` (по умолчанию `#000000`; часто
массив пастельных цветов), фон 300 %, бордер 1 px, цикл 14 с.

## Входные данные

- `borderWidth?` = `1` (px), `duration?` = `14` (с)
- `shineColor?: string | string[]` = `"#000000"`
- `className?`, `style?`, атрибуты `div`.

## Анимации

`motion-safe:animate-shine` → `@keyframes shine`: `background-position
0% 0% → 100% 100% → 0% 0%`, `var(--duration) infinite linear`. Маска
`content-box` XOR/exclude оставляет только полосу бордера.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/shine-border.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/registry/registry-ui.ts` — `@keyframes shine`
- `templates/react-libriry/magicui/apps/www/content/docs/components/shine-border.mdx` — документация

## Зависимости

Tailwind v4, `cn`.

## Совместимость и адаптация

`adaptable`. `animationDelay: \`${-frame/fps}s\`` + `paused`, или
`backgroundPosition` по треугольной волне `p = (t % d)/d`: `x = y =
(p < .5 ? 2p : 2 - 2p)·100%`. Учесть `motion-safe:` — при
`prefers-reduced-motion` анимации не будет.

## Паттерны

`key-point-emphasis`
