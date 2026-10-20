# InfiniteSlider — `motion-primitives/infinite-slider`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | complex |
| Флаги | `engine:motion`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Бесконечная лента-маркиза: дети (логотипы, карточки, отзывы) непрерывно
едут по горизонтали или вертикали, контент продублирован для бесшовного
цикла.

## Когда использовать

«Нам доверяют» с лентой логотипов, поток отзывов, бегущая строка
тегов/технологий, фон «много всего». Для поочерёдного появления пунктов —
`animated-group`.

## Фразы из озвучки

- «нам доверяют сотни компаний»
- «поддерживаются все популярные сервисы»
- «вот что говорят наши клиенты»

## Визуальный стиль

`flex w-max`, `gap` px, `overflow-hidden`; линейная скорость `speed` px/с.

## Входные данные

`InfiniteSliderProps`: `children`; `gap?` (16); `speed?` (100, px/с);
`speedOnHover?`; `direction?: 'horizontal'|'vertical'` (`'horizontal'`);
`reverse?` (false); `className?`.

## Анимации

`useMeasure` даёт ширину/высоту ленты; `animate(translation, [from, to],
{ease:'linear', duration: distance/speed, repeat: Infinity})`, где
`to = -(size + gap)/2`; при hover — плавная смена скорости.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/infinite-slider.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/infinite-slider/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/infinite-slider/infinite-slider-basic.tsx` — пример

## Зависимости

`motion` (`useMotionValue`, `animate`), `react-use-measure`.

## Совместимость и адаптация

`complex`: императивный бесконечный цикл motion + измерение DOM + hover.
Переписать: hover убрать; размер ленты задать константой (фиксированная
ширина элементов) или измерить один раз в `useLayoutEffect` под
`delayRender`; смещение —
`x = -(((frame/fps) * speed) % (contentSize/2))` (для `reverse` — со
сдвигом на `-contentSize/2`). Сам переписанный код тривиален, но
исходник как есть покадрово не работает.

## Паттерны

`quantities`, `relationships`
