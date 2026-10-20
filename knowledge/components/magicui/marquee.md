# Marquee — `magicui/marquee`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Бесконечная бегущая лента из любых элементов (логотипы, отзывы,
карточки, текст) по горизонтали или вертикали; контент повторяется
`repeat` раз.

## Когда использовать

Социальное доказательство: «нам доверяют», лента логотипов клиентов,
стена отзывов, перечень интеграций, бегущая строка новостей. 3D-стена
отзывов — пример `marquee-3d`.

## Фразы из озвучки

- «нам доверяют сотни компаний»
- «вот что говорят наши пользователи»
- «и этот список постоянно растёт»

## Визуальный стиль

Ровный линейный поток, `--duration: 40s`, `--gap: 1rem`; края обычно
гасятся градиентами снаружи компонента.

## Входные данные

- `children` (обязателен), `className?`
- `reverse?` = `false`, `pauseOnHover?` = `false`, `vertical?` = `false`
- `repeat?` = `4`; длительность и зазор — CSS-переменные `--duration`,
  `--gap` через `className` (`[--duration:20s]`).

## Анимации

Каждая из `repeat` копий — `animate-marquee` (`@keyframes marquee`:
`translateX(0) → translateX(calc(-100% - var(--gap)))`, `var(--duration)
infinite linear`) или `animate-marquee-vertical` (по Y);
`[animation-direction:reverse]`, `group-hover:[animation-play-state:paused]`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/marquee.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/registry/registry-ui.ts` — `@keyframes marquee`, `marquee-vertical`
- `templates/react-libriry/magicui/apps/www/content/docs/components/marquee.mdx` — документация (демо, вертикальный, логотипы, 3D)

## Зависимости

Tailwind v4, `cn`.

## Совместимость и адаптация

`adaptable`. Каждой копии `animationDelay: \`${-frame/fps}s\`` +
`animationPlayState: 'paused'` (длительность в секундах та же), либо
вычислять `translateX(calc(${-p·100}% - ${p}·var(--gap)))`, `p = (t %
D)/D`. `pauseOnHover` не использовать. Бесшовность сохраняется, т.к.
сдвиг относителен ширины копии.

## Паттерны

`sequence-steps`, `quantities`, `relationships`
