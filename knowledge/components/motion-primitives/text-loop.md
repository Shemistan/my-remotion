# TextLoop — `motion-primitives/text-loop`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Слот внутри строки, в котором по кругу сменяются слова/фразы: текущее
уезжает вверх и гаснет, следующее въезжает снизу.

## Когда использовать

«Мы помогаем [дизайнерам / разработчикам / аналитикам]» — перечисление
вариантов в одной позиции, слоганы, смена ролей/продуктов. Не для длинных
абзацев. Если слова должны сменяться точно под озвучку — задать индексы
по кадрам вручную.

## Фразы из озвучки

- «подходит для дизайнеров, разработчиков и менеджеров»
- «быстро, надёжно, удобно»
- «работает на любом устройстве: телефоне, планшете, ноутбуке»

## Визуальный стиль

Нейтральный `inline-block whitespace-nowrap`; движение по вертикали
±20 px с fade, 0.3 с.

## Входные данные

`TextLoopProps`: `children: React.ReactNode[]`; `interval?` (2, с);
`transition?` (`{ duration: 0.3 }`); `variants?` (по умолчанию
`initial {y:20, opacity:0}` → `animate {y:0, opacity:1}` → `exit {y:-20, opacity:0}`);
`mode?` (`'popLayout'`); `trigger?` (true); `onIndexChange?`; `className?`.

## Анимации

`setInterval(interval*1000)` увеличивает `currentIndex` по модулю длины;
`AnimatePresence` с `key={currentIndex}` проигрывает exit старого и
enter нового элемента.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/text-loop.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/text-loop/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/text-loop/text-loop-basic.tsx` — пример

## Зависимости

`motion` (`motion/react`), `react`, `@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: логика целиком сводится к индексу от кадра.
`setInterval`/`useState` удалить; `period = interval*fps`,
`index = Math.floor(frame/period) % n`, `local = frame % period`. Рендерить
текущий элемент с `p = interpolate(local, [0, 0.3*fps], [0,1])`
(`y = 20*(1-p)`, `opacity = p`), а в первые 0.3 с периода — ещё и
предыдущий с `y = -20*p`, `opacity = 1-p` (замена `AnimatePresence`).

## Паттерны

`abstract-concepts`, `comparison`, `key-point-emphasis`
