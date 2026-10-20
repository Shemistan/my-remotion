# AnimatedShinyText — `magicui/animated-shiny-text`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Приглушённый серый текст, по которому периодически проходит светлый
блик слева направо, будто по металлу.

## Когда использовать

Бейдж/плашка «Новое», подзаголовок, анонс фичи — когда нужен тонкий
акцент без смены цвета. Для крупного яркого акцента лучше
`aurora-text` или `animated-gradient-text`.

## Фразы из озвучки

- «и небольшое, но приятное обновление»
- «обратите внимание на эту строку»
- «доступно уже сегодня»

## Визуальный стиль

Сдержанный, «премиальный»: серый 70 % прозрачности, белый/чёрный блик
шириной `shimmerWidth`. Цикл 8 с, блик занимает ~30 % цикла.

## Входные данные

- `shimmerWidth?: number` = `100` (px, CSS-переменная `--shiny-width`)
- `children`, `className`, прочие атрибуты `span`.

## Анимации

`animate-shiny-text` → `@keyframes shiny-text`: `background-position`
от `calc(-100% - var(--shiny-width))` к `calc(100% + …)` на 30–60 % и
обратно; плюс `transition: background-position 1s` (лишний для
видео).

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/animated-shiny-text.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/registry/registry-ui.ts` — `@keyframes shiny-text`
- `templates/react-libriry/magicui/apps/www/content/docs/components/animated-shiny-text.mdx` — документация

## Зависимости

Tailwind v4 (`bg-linear-to-r`, `bg-clip-text`, `bg-size-*`), `cn`.

## Совместимость и адаптация

`adaptable`. Отрицательный `animationDelay` от кадра +
`animationPlayState: 'paused'`, убрать `transition`; или вычислять
`backgroundPosition` по кадру (блик проходит за 30 % периода).

## Паттерны

`key-point-emphasis`
