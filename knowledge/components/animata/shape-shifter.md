# ShapeShifter — `animata/shape-shifter`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `layout-templates` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `user-events`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Строка «Shape [окно] Shifter»: между двумя словами — окно, которое
бесконечно меняет форму (40×20 → 240×128 → 80×80 → 128×240 → 80×80), а
внутри бежит лента фотографий (`Marquee`).

## Когда использовать

Hero-заставка, «меняем форму», гибкость, адаптивность, портфолио. Вместо
фото можно положить видео/любой контент (`children`).

## Фразы из озвучки

- «мы подстраиваемся под любую задачу»
- «форма меняется — суть остаётся»
- «гибкость во всём»

## Визуальный стиль

Плакатный, `font-bold sm:text-xl`, окно `bg-black dark:bg-white`, цикл 8 с
`alternate`.

## Входные данные

`prefix?: ReactNode` (`"Shape"`), `suffix?: ReactNode` (`"Shifter"`),
`children?` (по умолчанию `Marquee` из 5 картинок Unsplash),
`className?` (окно), `containerClassName?`.

## Анимации

Tailwind `animate-[shape-shift]` + `direction-alternate repeat-infinite`,
`animationDuration: 8s`, `ease-in-out`; keyframes `shape-shift` (width/height)
в `styles/globals.css`; пауза по `group-hover/shifter`. Внутри — CSS-marquee
(`animate-marquee-horizontal`).

## Исходники и документация

- `templates/react-libriry/animata/animata/hero/shape-shifter.tsx` — компонент
- `templates/react-libriry/animata/styles/globals.css` — `@keyframes shape-shift`, `marquee-x`
- `templates/react-libriry/animata/content/docs/hero/shape-shifter.mdx` — документация
- `templates/react-libriry/animata/animata/hero/shape-shifter.stories.tsx` — пример

## Зависимости

`@/animata/container/marquee`, Tailwind v4 + `tw-animate-css`
(`direction-alternate`, `repeat-infinite`), `@/lib/utils`.

## Совместимость и адаптация

width/height окна вычислять из `t = (frame/fps) % 16` (alternate → туда и
обратно по 8 с) по ключам keyframes; Marquee — `translateX` из кадра; фото
Unsplash заменить на `staticFile` + `<Img>` (иначе сеть в рендере).

## Паттерны

`transformation`, `abstract-concepts`
