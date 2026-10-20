# AnimatedNumber — `motion-primitives/animated-number`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Число, которое пружинно «докручивается» до нового значения; целое,
с разделителями разрядов (`toLocaleString`), табличные цифры.

## Когда использовать

Метрика в озвучке: пользователи, выручка, рост. Хорош в KPI-плашке или
рядом с графиком. Если нужны дробные значения/префиксы — проще
`remotion-bits/animated-counter`; для «барабана» цифр — `sliding-number`.

## Фразы из озвучки

- «аудитория выросла до 120 тысяч»
- «мы обработали больше миллиона заявок»
- «стоимость снизилась с 5000 до 3200»

## Визуальный стиль

Нейтральный `span` с `tabular-nums`; характер — через `springOptions`
(в примере `bounce: 0, duration: 1000`).

## Входные данные

`AnimatedNumberProps`: `value: number`; `springOptions?: SpringOptions`;
`as?` (`'span'`); `className?`.

## Анимации

`useSpring(value)` + `useEffect(() => spring.set(value))`; отображение
`Math.round(current).toLocaleString()` через `useTransform`.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/animated-number.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/animated-number/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/animated-number/animated-number-counter.tsx` — пример (кнопки ±100)

## Зависимости

`motion` (`useSpring`, `useTransform`, `motion.create`), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: motion-spring живёт во времени браузера. Заменить на
`const p = spring({frame: frame - start, fps, config: {damping: 200}})`
(или `interpolate` с easing) и
`Math.round(interpolate(p, [0,1], [from, to])).toLocaleString('ru-RU')`.
Явно задать локаль — иначе разделители зависят от окружения рендера.

## Паттерны

`quantities`, `growth-decline`, `key-point-emphasis`
