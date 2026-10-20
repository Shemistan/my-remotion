# AnimatedCounter — `remotion-bits/animated-counter`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Число, которое плавно «докручивается» от одного значения к другому (или по
цепочке ключевых значений), с опциональным префиксом/постфиксом (валюта,
%, единицы) и фиксированным числом знаков после запятой.

## Когда использовать

Любая метрика, которую озвучка называет цифрой: выручка, проценты, число
пользователей, цена. Хорош в связке с `StaggeredMotion` (появление) и
`bit-bar-chart`/`bit-stat-rings` (контекст). Не брать для форматированных
строк вроде дат — он интерполирует число и вызывает `toFixed`.

## Фразы из озвучки

- «выросло до 10 тысяч пользователей»
- «конверсия составила 4,7 %»
- «за год мы заработали 2 миллиона»
- «показатель упал с 80 до 35»

## Визуальный стиль

Нейтральный: `inline-flex` span без собственного оформления, вся типографика
задаётся через `style`/`className`. Темп и характер — через easing
(`easeOutCubic`, `spring` и т.д.).

## Входные данные

`AnimatedCounterProps`:

- `transition` (обязателен): `TransformProps & VisualProps & TimingProps &
  { values: AnimatedValue }` — `values: number | (number | Hold)[]`
  (например `[0, 100]` или `[0, 100, 50]`, поддерживает `hold(frames)`);
  тайминг `frames?: [start, end]`, `duration?` (кадры), `delay?`, `easing?`
  (имя или функция); трансформы `x y z scale scaleX scaleY rotate rotateX
  rotateY rotateZ skew skewX skewY`; визуал `opacity color backgroundColor
  blur`.
- `prefix?`, `postfix?: React.ReactNode`.
- `toFixed?: number` (по умолчанию 0).
- `className?`, `style?`.

Если `duration` не задан: внутри `Scene3D`-шага — 30 кадров, иначе `fps`
(1 секунда).

## Анимации

Интерполяция значения через `interpolateKeyframes` по прогрессу
`useMotionTiming` (кадр → 0…1 с easing); одновременно к контейнеру
применяются трансформы/opacity через `buildMotionStyles`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/components/AnimatedCounter.tsx` — компонент
- `templates/remotion-components/remotion-bits/src/utils/motion/index.ts` — типы `AnimatedValue`, `TransformProps`, `TimingProps`, `useMotionTiming`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/animated-counter.mdx` — документация
- `templates/remotion-components/remotion-bits/docs/src/bits/examples/animated-counter/BasicCounter.tsx` — пример

## Зависимости

`remotion` (`useVideoConfig`), внутренние `../utils/motion`,
`../utils/StepContext`; транзитивно `three` (Matrix4 в motion-утилитах).

## Совместимость и адаптация

`native`: прогресс считается из `useCurrentFrame` внутри `useMotionTiming`,
без таймеров и состояния. Адаптации не нужны; при использовании вне
`remotion-bits` нужен сам пакет или копия `src/utils/motion`.

## Паттерны

`quantities`, `growth-decline`, `key-point-emphasis`
