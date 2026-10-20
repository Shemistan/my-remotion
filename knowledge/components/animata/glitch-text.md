# GlitchText — `animata/glitch-text`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

RGB-глитч: под чётким основным текстом два «призрака» (пурпурный и циан,
`mix-blend-mode: screen`) коротко дёргаются в конце каждого цикла.

## Когда использовать

Сбой, ошибка, 404, «что-то пошло не так», киберпанк, дисплейные заголовки.
Не для мелкого текста.

## Фразы из озвучки

- «система дала сбой»
- «ошибка 404»
- «реальность начинает глючить»

## Визуальный стиль

Неоновый, высококонтрастный; burst в 88–100 % цикла 2.5 с.

## Входные данные

`GlitchTextProps` (+ атрибуты `span`): `children: string`, `intensity?` (5,
множитель шага), `step?` (`"0.01em"`), `duration?: number | string` (2.5 →
`2.5s`), `baseColor?` (`var(--text-foreground)` в CSS), `colorA?`
(`#ff00ff`), `colorB?` (`#00ffff`), `blendMode?: "screen" | "normal"`
(`screen`). Props → CSS-переменные `--glitch-*`.

## Анимации

`glitch-text.css`: `@keyframes glitch-a` / `glitch-b` — `transform:
translate(±--glitch-x, ±--glitch-y)` и opacity у ghost-слоёв, `infinite`;
есть `prefers-reduced-motion`.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/glitch-text.tsx` — компонент
- `templates/react-libriry/animata/animata/text/glitch-text.css` — keyframes
- `templates/react-libriry/animata/content/docs/text/glitch-text.mdx` — документация
- `templates/react-libriry/animata/animata/text/glitch-text.stories.tsx` — пример

## Зависимости

`@/lib/utils`, co-located CSS.

## Совместимость и адаптация

Оставить CSS, ghost-слоям задать `animationDelay: -(frame/fps)+'s'` и
`animationPlayState: 'paused'`; либо вычислять `translate` ghost-ов из
`(frame/fps) % duration` по таблице keyframes.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
