# StatCard — `motion-primitives-website/stat-card`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

KPI-карточка: подпись и иконка сверху, крупное число (пружинный счётчик)
и бейдж тренда — зелёная стрелка вверх или красная вниз с процентом и
подписью «vs last month».

## Когда использовать

Дашборд-сцена: «пользователей — 12.8K, +12.5 % к прошлому месяцу»;
сетка из 3–4 карточек для отчёта. Рост и падение показываются цветом и
стрелкой.

## Фразы из озвучки

- «пользователей стало на 12 % больше, чем в прошлом месяце»
- «выручка снизилась на 3 процента»
- «ключевые метрики квартала»

## Визуальный стиль

`rounded-xl border border-border/30 bg-surface/80 p-5`, число
`text-3xl font-bold`; цвета — CSS-переменные темы сайта (`--surface`,
`--border`, `--muted-foreground`) — в Remotion задать свои.

## Входные данные

`StatCardProps`: `value: number`; `label: string`; `format?`
(как у `spring-counter`); `prefix?`, `suffix?`; `trend?: {value: number;
label?: string}`; `icon?: ReactNode`; `className?`.

## Анимации

Карточка — `whileInView` spring (200/20) `opacity 0 → 1, y 20 → 0`;
бейдж — `scale 0.8 → 1`, delay 0.3 с; число — `AnimatedCounter`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/animated-counter.tsx` — компонент

## Зависимости

`framer-motion`, внутренний `AnimatedCounter` (`spring-counter`),
`tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `whileInView` → `p = spring({frame: frame - s, fps, config: {stiffness: 200, damping: 20}})`
(`opacity p`, `translateY(20(1-p))`), бейдж — то же с задержкой 0.3 с и
`scale(0.8+0.2p)`; счётчик — по рецепту `spring-counter`. CSS-переменные
темы заменить цветами.

## Паттерны

`quantities`, `growth-decline`, `comparison`
