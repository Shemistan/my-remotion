# OrbitingCircles — `magicui/orbiting-circles`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Иконки (дети), равномерно расставленные по круговой орбите и
вращающиеся вокруг центра; тонкая окружность-траектория. Несколько
экземпляров разного радиуса дают «солнечную систему».

## Когда использовать

Экосистема вокруг продукта: интеграции, партнёры, технологии вокруг
ядра; «всё вращается вокруг клиента». Для связей-лучей — `animated-beam`.

## Фразы из озвучки

- «в центре — наш продукт, вокруг — вся экосистема»
- «интегрируется со всеми популярными сервисами»
- «всё вращается вокруг клиента»

## Визуальный стиль

Окружность `black/10` (dark `white/10`), иконки 30 px, оборот 20 с;
спокойно, «лендинговая» инфографика.

## Входные данные

- `children` (иконки), `className?`, атрибуты `div`
- `reverse?` (boolean), `duration?` = `20` (с), `radius?` = `160` (px)
- `path?` = `true`, `iconSize?` = `30`, `speed?` = `1` (делит duration)
- `delay?` объявлен в типе, в коде не используется.

## Анимации

Угол ребёнка `360/n · i`; класс `animate-orbit` → `@keyframes orbit`:
`rotate(angle) translateY(radius px) rotate(-angle)` → то же `+360deg`,
`calc(var(--duration)*1s) linear infinite`; `reverse` —
`animation-direction: reverse`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/orbiting-circles.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/registry/registry-ui.ts` — `@keyframes orbit`
- `templates/react-libriry/magicui/apps/www/content/docs/components/orbiting-circles.mdx` — документация

## Зависимости

Tailwind v4, `cn`.

## Совместимость и адаптация

`adaptable`. Вместо класса — inline `transform: rotate(${a}deg)
translateY(${radius}px) rotate(${-a}deg)`, где `a = angle_i ±
360·t/(duration/speed)`; или отрицательный `animationDelay` + `paused`.
Появление иконок — stagger по кадру поверх.

## Паттерны

`relationships`, `system-structure`
