# Bento Gradient — `animata/bento-gradient`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | example |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition`, `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Bento-сетка 3 колонки на тёмном `bg-zinc-950`: четыре карточки с иконкой,
заголовком, описанием и мягким цветным градиентом (Gradient, Linear,
Radial, Conic); у первой — чёрный блок «Get Gradients» с круглой кнопкой.

## Когда использовать

Обзор 3–4 фич/понятий одной сценой, «четыре вида чего-то». Для
продуктовых метрик — `animata/bento-eight`.

## Фразы из озвучки

- «есть четыре вида градиентов»
- «коротко о каждой возможности»
- «выбирайте то, что подходит вам»

## Визуальный стиль

Тёмная рамка, светлые карточки с градиентами (cyan/sky/indigo,
red/rose, lime/green), lucide-иконки, жирные заголовки.

## Входные данные

Без props: тексты, иконки и градиенты зашиты в `GetGradient`,
`LinearGradient`, `RadialGradient`, `ConicGradient`; `BentoCard({title,
icon, description, gradient, className, children})` — внутренний.

## Анимации

Только hover: вращение кнопки 360° (`transition-transform duration-700`),
`animate-pulse` полосок, `animate-in slide-in-from-right-full` иконок
(tw-animate-css). `MovingGradient` с `animated={false}`.

## Исходники и документация

- `templates/react-libriry/animata/animata/bento-grid/gradient.tsx` — композиция
- `templates/react-libriry/animata/animata/background/moving-gradient.tsx` — фон карточек
- `templates/react-libriry/animata/content/docs/bento-grid/gradient.mdx` — документация
- `templates/react-libriry/animata/animata/bento-grid/gradient.stories.tsx` — пример

## Зависимости

`lucide-react`, `animata/background/moving-gradient`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: статичная разметка рендерится как есть. Для видео — вход
карточек по очереди (opacity/translateY из `interpolate(frame - i*8)`),
hover-эффекты заменить проигрыванием по кадру (rotate кнопки) или убрать.
Вынести тексты в props.

## Паттерны

`comparison`, `sequence-steps`
