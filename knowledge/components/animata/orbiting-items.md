# OrbitingItems — `animata/orbiting-items`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Тёмно-синий радиальный фон, две концентрические окружности и иконки в
кружках, равномерно расставленные по большой орбите; вся система
медленно вращается, иконки остаются вертикальными (контр-вращение).

## Когда использовать

«Экосистема вокруг продукта», интеграции, технологический стек вокруг
ядра. Для 3D-эллипса с центральным логотипом — `animata/orbiting-items-3-d`.

## Фразы из озвучки

- «всё вращается вокруг вашего продукта»
- «интеграции с GitHub, React, Tailwind и другими»
- «единая экосистема»

## Визуальный стиль

Радиальный градиент `#030637 → #10439F`, серые орбиты, светлые кружки
48px с иконками; очень медленно (45 с на оборот).

## Входные данные

`radius = 50` (% от контейнера 256px), `items = testOrbitingItems` (6
иконок GitHub/Twitter/React/Tailwind/Framer/Apple из `@/components/icons`),
`pauseOnHover?`, `backgroundClassName?`, `containerClassName?`, `className?`.

## Анимации

Tailwind `animate-rotate-full` (`rotate-full 45s linear infinite`,
keyframes в `styles/globals.css`) на контейнере и с
`direction-reverse` на иконках и внутренней орбите.

## Исходники и документация

- `templates/react-libriry/animata/animata/list/orbiting-items.tsx` — компонент
- `templates/react-libriry/animata/content/docs/list/orbiting-items.mdx` — документация
- `templates/react-libriry/animata/animata/list/orbiting-items.stories.tsx` — пример

## Зависимости

`@/components/icons` (иконки сайта), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: позиции считаются в `calculateItemStyle` детерминированно;
заменить классы на `transform: rotate(${angle}deg)` у контейнера и
`rotate(${-angle}deg)` у иконок, `angle = frame/fps * 360/45` (или быстрее
для видео). Иконки подставить свои.

## Паттерны

`system-structure`, `relationships`
