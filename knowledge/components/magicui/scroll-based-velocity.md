# ScrollVelocityRow / ScrollVelocityContainer — `magicui/scroll-based-velocity`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `user-events`, `dom`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Бесконечная бегущая строка крупного текста (или любых элементов);
скорость и направление ускоряются от скорости прокрутки страницы.
Обычно две строки навстречу друг другу.

## Когда использовать

В видео — энергичная бегущая строка-разделитель, слоган, перечень
ключевых слов («скорость • надёжность • масштаб»); ускорение можно
связать с кульминацией. Для логотипов/карточек — `marquee`.

## Фразы из озвучки

- «скорость, надёжность, масштаб»
- «движение не останавливается ни на секунду»
- «и темп только растёт»

## Визуальный стиль

`whitespace-nowrap`, копии контента встык; базовая скорость `5 %`
ширины блока в секунду, ускорение до ×6 при прокрутке.

## Входные данные

- `ScrollVelocityRow`: `children`, `baseVelocity?` = `5`,
  `direction?: 1|-1` = `1`, `scrollReactivity?` = `true`, `className?`
- `ScrollVelocityContainer`: общий контекст скорости для нескольких рядов, `className?`
- экспорт `wrap(min, max, v)`.

## Анимации

`useAnimationFrame` двигает `baseX += dir · bw·baseVelocity/100 ·
(1 + |vf|) · dt`; `x = -wrap(0, bw, baseX)`. `vf` — из
`useVelocity(useScroll().scrollY)` через `useSpring(50/400)`. Число
копий и ширина блока — `ResizeObserver`; пауза по
`IntersectionObserver`/`visibilitychange`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/scroll-based-velocity.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/scroll-based-velocity.mdx` — документация

## Зависимости

`motion` (`useAnimationFrame`, `useScroll`, `useVelocity`, `useSpring`, `useTransform`), `cn`.

## Совместимость и адаптация

`adaptable`. Убрать scroll и rAF; `x = -wrap(0, bw, dir · bw ·
baseVelocity/100 · t · k(t))`, где `k(t)` — своя кривая ускорения (или
1). Ширину блока `bw` измерить один раз под `delayRender` или задать
(моно-шрифт/известный текст), число копий — `ceil(W/bw)+2`.

## Паттерны

`key-point-emphasis`, `sequence-steps`
