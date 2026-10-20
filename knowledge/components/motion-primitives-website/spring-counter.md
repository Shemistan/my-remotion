# SpringCounter (AnimatedCounter) — `motion-primitives-website/spring-counter`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Пружинный счётчик от 0 до значения с форматами: число, валюта, процент,
compact (`12.8K`, `1.2M`), с префиксом/суффиксом.

## Когда использовать

Дашборд-метрики, выручка в валюте, проценты конверсии, «12.8K
пользователей». В файле `animated-counter.tsx` компонент называется
`AnimatedCounter`, из `interactive/index.ts` экспортируется как
`SpringCounter`.

## Фразы из озвучки

- «выручка — 4250 долларов»
- «конверсия выросла до 99,7 процента»
- «аудитория — почти 13 тысяч»

## Визуальный стиль

`tabular-nums`; spring `stiffness 50, damping 20, mass 1` — плавно,
с лёгким перелётом.

## Входные данные

`AnimatedCounterProps`: `value: number`; `format?: 'number'|'currency'|
'percent'|'compact'` (`'number'`); `currency?` (`'$'`); `decimals?` (0);
`prefix?`, `suffix?` (`''`); `animateOnView?` (true); `springConfig?`
(`{stiffness: 50, damping: 20, mass: 1}`); `className?`. Prop `duration`
объявлен в типе, но не используется.

## Анимации

`useInView` (once, margin −50px) → `springValue.set(value)`;
`formatValue` на каждом кадре spring (`toLocaleString(undefined, …)`).

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/animated-counter.tsx` — компонент (+ `StatCard`)
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Animated Counter»

## Зависимости

`framer-motion` (`useSpring`, `useTransform`, `useInView`), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `v = value * spring({frame: frame - start, fps, config: {stiffness: 50, damping: 20, mass: 1}})`,
строку получать той же `formatValue(v, …)`; `useInView` удалить; в
`toLocaleString` передать явную локаль (`'ru-RU'`) — иначе формат зависит
от машины рендера.

## Паттерны

`quantities`, `growth-decline`, `key-point-emphasis`
