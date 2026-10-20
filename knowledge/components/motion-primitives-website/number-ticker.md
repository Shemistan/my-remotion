# NumberTicker — `motion-primitives-website/number-ticker`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Счётчик, пружинно отсчитывающий от 0 до значения (или от значения до 0)
с префиксом/суффиксом и фиксированным числом знаков, формат `en-US`
(разделитель — запятая).

## Когда использовать

KPI и большие цифры в озвучке: «$2.4M», «99.9 %», «10 000+». Для русского
формата чисел нужно сменить локаль.

## Фразы из озвучки

- «выручка достигла двух миллионов»
- «доступность — 99,9 процента»
- «больше десяти тысяч клиентов»

## Визуальный стиль

`inline-block tabular-nums tracking-wider text-foreground`; spring
`damping 60, stiffness 100` — медленный, без отскока.

## Входные данные

`NumberTickerProps`: `value: number`; `direction?: 'up'|'down'` (`'up'`);
`delay?` (0, с); `decimalPlaces?` (0); `prefix?` (`''`); `suffix?` (`''`);
`className?`.

## Анимации

`useInView` (once) → `setTimeout(delay)` → `motionValue.set(value)` →
`useSpring`; на `change` пишет `ref.current.textContent` напрямую
(минуя React).

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/number-ticker.tsx` — компонент (+ `AnimatedCounter`)

## Зависимости

`framer-motion` (`useInView`, `useMotionValue`, `useSpring`), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: прямую запись в DOM, `useInView`, `setTimeout` удалить;
`p = spring({frame: frame - delay*fps, fps, config: {damping: 60, stiffness: 100}})`,
`v = direction === 'up' ? value*p : value*(1-p)`, рендер
`prefix + Intl.NumberFormat('ru-RU', {min/maxFractionDigits: decimalPlaces}).format(v) + suffix`.

## Паттерны

`quantities`, `growth-decline`, `key-point-emphasis`
