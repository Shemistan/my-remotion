# Marquee — `animata/marquee`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Бесконечная бегущая лента (горизонтальная или вертикальная) из
повторённых `children` с градиентной маской-затуханием по краям.

## Когда использовать

Логотипы клиентов/интеграций, отзывы, теги, «бегущая строка» новостей.
Две ленты в противоположных направлениях — «много всего». Для баннера с
бейджем — `animata/announcement-ribbon`.

## Фразы из озвучки

- «нам доверяют сотни компаний»
- «интеграции со всеми популярными сервисами»
- «отзывы говорят сами за себя»

## Визуальный стиль

Нейтральный flex-контейнер, gap 12px, маска white/50 (dark: gray-800/50);
равномерный линейный темп, цикл 10 с.

## Входные данные

`MarqueeProps extends HTMLAttributes<div>`: `vertical = false`,
`repeat = 5`, `reverse = false`, `pauseOnHover = false`,
`applyMask = true`, `className?`, `children`. CSS-переменные
`--duration` (10s) и `--gap` (12px) через классы `[--duration:…]`.

## Анимации

CSS `@keyframes marquee-x / marquee-y` (translate 0 → `-100% - gap`) из
локального `marquee.css`, `infinite linear`; `reverse` —
`animationDirection: reverse`; пауза на hover.

## Исходники и документация

- `templates/react-libriry/animata/animata/container/marquee.tsx` — компонент
- `templates/react-libriry/animata/animata/container/marquee.css` — keyframes
- `templates/react-libriry/animata/content/docs/container/marquee.mdx` — документация
- `templates/react-libriry/animata/animata/container/marquee.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: на каждом повторе задать `animationDelay: -(frame/fps)s` и
`animationPlayState: paused` (длительность `--duration` в секундах) либо
inline `transform: translateX(calc(-${p*100}% - ${p}*var(--gap)))` с
`p = (frame / (dur*fps)) % 1`. `pauseOnHover` не нужен.

## Паттерны

`relationships`, `quantities`
