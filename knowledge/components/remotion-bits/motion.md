# Motion utilities (useMotionTiming / buildMotionStyles) — `remotion-bits/motion`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Ничего не рисует; общее ядро всех анимирующих компонентов пакета: кадр →
прогресс 0…1 (с delay, stagger, шагом Scene3D) → CSS-стили (transform,
opacity, blur, цвет, borderRadius) по ключевым значениям с `hold()`.

## Когда использовать

Свой компонент в стиле remotion-bits: те же props `transition` (`x`, `y`,
`scale`, `opacity: [0,1]`, `blur: [10,0]`, `color: [..]`), stagger и
поддержка `Step`. Готовые обёртки — `staggered-motion`, `animated-text`.

## Фразы из озвучки

Косвенно — под любую реплику с появлением элементов:
- «появляется один за другим»
- «вылетает снизу и проявляется»
- «замирает на секунду и уходит»

## Входные данные

Типы `AnimatedValue<T> = T | (T | Hold)[]`, `TransformProps` (`x y z scale
scaleX scaleY rotate rotateX rotateY rotateZ skew skewX skewY transform`),
`VisualProps` (`opacity`, `color: string[]`, `backgroundColor: string[]`,
`blur`, `borderRadius`), `TimingProps` (`frames`, `duration`, `delay`,
`easing`). Функции: `useMotionTiming({frames?, duration?, delay? (0),
stagger? (0), unitIndex? (0), easing?, cycleOffset?})` — хук;
`buildMotionStyles({progress, transforms?, styles?, easing?, baseStyle?,
duration?})`; `buildTransformString`; `interpolateKeyframes(value, progress,
easingFn?, duration?)` (для `hold` нужен duration); `getEasingFunction`;
реэкспорт `useStepTiming`, `StepTimingContext`.

## Анимации

Нет собственных. Длительность по умолчанию: внутри Step — 30, иначе `fps`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/utils/motion/index.ts` — реализация
- `templates/remotion-components/remotion-bits/src/utils/StepContext.ts` — контекст шага
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/utils-motion.mdx` — справка

## Зависимости

`remotion` (`useCurrentFrame`, `useVideoConfig`), `three` (Matrix4),
внутренние `interpolate`, `interpolate3d`, `color` (culori), `transform3d`.

## Совместимость и адаптация

`native`. Замечание: `useMotionTiming` не применяет `easing` к прогрессу —
easing применяется внутри `interpolateKeyframes`/`buildMotionStyles`; при
ручном использовании прогресса easing нужно применить самому.

## Паттерны

нет
