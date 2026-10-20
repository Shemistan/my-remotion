# Bento Eight — `animata/bento-eight`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | example |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | complex |
| Флаги | `timers`, `css-transition`, `user-events`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Яркая bento-сетка 4×3 из 8 цветных карточек EdTech-продукта: рейтинг
«4.8★» (Ticker), «179k+ students» (Counter + AvatarList), AI-чат с
печатающимся ответом (TypingText), «Generate progress report» со
скелетоном, крупное «EDU», недельный бар-чарт, теги Javascript/ReactJS/
NextJS, «Daily reminders».

## Когда использовать

Обзор продукта одним экраном «всё в одном», промо-ролик. Если нужна
спокойная сетка без вложенных анимаций — `animata/bento-four` и т.п.

## Фразы из озвучки

- «более 179 тысяч студентов уже с нами»
- «рейтинг 4,8 звезды»
- «встроенный ИИ отвечает на вопросы»
- «всё, что нужно для учёбы, — в одном месте»

## Визуальный стиль

Насыщенные пастельные плашки (yellow/violet/orange/lime/zinc/green/rose/
blue), rounded-2xl, font-black; энергично, «маркетингово».

## Входные данные

Без props; всё зашито (`FeatureOne`…`FeatureEight`, `BoldCopy`).

## Анимации

Внутри вложенных компонентов: `Ticker`, `Counter`, `TypingText` (срез
text), `BarChart` (setTimeout 250 мс + CSS transition высоты),
`AvatarList` (`animate-bg-position`, hover), hover-увеличение `BoldCopy`.

## Исходники и документация

- `templates/react-libriry/animata/animata/bento-grid/eight.tsx` — композиция
- `templates/react-libriry/animata/content/docs/bento-grid/eight.mdx` — документация
- `templates/react-libriry/animata/animata/bento-grid/eight.stories.tsx` — пример

## Зависимости

`lucide-react`; `animata/graphs/bar-chart`, `animata/list/avatar-list`,
`animata/skeleton/report`, `animata/skeleton/wide-card`,
`animata/text/counter`, `animata/text/ticker`, `animata/text/typing-text`.

## Совместимость и адаптация

`complex` из-за вложенных таймерных анимаций. Раскладку (grid-cols-4,
spans) брать как есть; дочерние анимации заменить покадровыми: счётчики —
`remotion-bits/animated-counter`, печать — срез строки по кадру, бары —
высота × прогресс. Внешние фото аватаров (Unsplash) — через `staticFile`.

## Паттерны

`quantities`, `key-point-emphasis`, `sequence-steps`
