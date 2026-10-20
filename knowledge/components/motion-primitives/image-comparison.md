# ImageComparison — `motion-primitives/image-comparison`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `user-events`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Два изображения друг над другом и вертикальная линия-разделитель:
слева видно одно, справа другое — классическое «до / после».

## Когда использовать

Сравнение до и после: ретушь, редизайн, ремонт, результат обработки
нейросетью, старая/новая версия интерфейса. В видео разделитель
двигается сам по сценарию, а не мышью.

## Фразы из озвучки

- «посмотрите, как было и как стало»
- «до обработки и после»
- «разница видна невооружённым глазом»

## Визуальный стиль

Контейнер `relative overflow-hidden select-none`; картинки
`object-cover`, обрезка `clip-path: inset(...)`; слайдер — полоса `w-1`,
внешний вид задаётся `className`/children.

## Входные данные

`ImageComparison`: `children`, `className?`, `enableHover?`,
`springOptions?` (по умолчанию `{bounce: 0, duration: 0}`).
`ImageComparisonImage`: `src`, `alt`, `position: 'left'|'right'`,
`className?`. `ImageComparisonSlider`: `className`, `children?`.
Стартовая позиция — 50 %.

## Анимации

Позиция (0–100 %) из `clientX` при drag/hover → `useSpring` →
`clipPath: inset(0 0 0 v%)` / `inset(0 {100-v}% 0 0)` и `left: v%`
у слайдера.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/image-comparison.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/image-comparison/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/image-comparison/image-comparison-basic.tsx` — пример

## Зависимости

`motion` (`useMotionValue`, `useSpring`, `useTransform`), `react` context.

## Совместимость и адаптация

`adaptable`: интерактив (`onMouseMove`/`onTouch*`,
`getBoundingClientRect`) удалить; позицию считать из кадра,
`v = interpolate(frame, [s, e], [10, 90], {easing: Easing.inOut(Easing.cubic)})`,
передавать в контекст обычным числом и строить `clipPath`/`left` строкой.
`motion.img` → `Img` из remotion (ожидание загрузки картинки).

## Паттерны

`comparison`, `transformation`
