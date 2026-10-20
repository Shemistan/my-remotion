# StepIndicator — `motion-primitives-website/step-indicator`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `user-events`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Индикатор шагов: кружки (точки или номера с галочкой у пройденных),
соединённые линиями, которые заполняются до текущего шага; текущий
кружок увеличен; вариант «таблетки» — ряд подписей.

## Когда использовать

Пошаговый процесс: онбординг, этапы проекта, воронка «регистрация →
профиль → оплата»; «мы на втором шаге из четырёх».

## Фразы из озвучки

- «шаг первый — регистрация»
- «мы уже на третьем этапе из пяти»
- «осталось подтвердить заказ»

## Визуальный стиль

`dots` — точки 12 px; `line` — кружки 32 px с номером или галочкой,
подписи 10 px снизу; `pills` — `rounded-full px-3 py-1.5`; цвета
`primary`/`muted` темы; коннектор 48–80 px.

## Входные данные

`StepIndicatorProps`: `steps: string[]`; `currentStep: number`;
`variant?: 'dots'|'line'|'pills'` (`'dots'`); `onStepClick?`;
`className?`.

## Анимации

Текущий кружок `scale 1.2` spring 300/20; коннектор `width 0 → 100%`
spring 200/25 при `i < currentStep`; hover/tap на кнопках; `layout` у
pills.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/progress.tsx` — компонент
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Step Indicator»

## Зависимости

`framer-motion`, `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `currentStep` вычислять из кадра по расписанию шагов;
`whileHover/whileTap/onClick` удалить; заполнение коннектора `i` —
`spring({frame: frame - tStep(i+1), fps, config: {stiffness: 200, damping: 25}})`
→ `width %`; масштаб текущего — `1 + 0.2*spring(…)`; `transition-colors`
заменить `interpolateColors` по тому же прогрессу.

## Паттерны

`sequence-steps`, `timeline`
