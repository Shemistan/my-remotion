# AnimatedText — `remotion-bits/animated-text`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Текст, который появляется целиком, по словам, по буквам, по строкам или по
произвольному разделителю: каждый фрагмент сдвигается, масштабируется,
вращается, проявляется из размытия или меняет цвет с задержкой. Умеет
«глитч» (случайная подмена символов) и перебор фраз (`cycle`).

## Когда использовать

Заголовки, ключевые тезисы, цитаты, слоганы — когда фразу нужно «выложить»
на экран синхронно с озвучкой. Для печати с курсором и опечатками — `type-writer`;
для группы блоков/карточек — `staggered-motion`.

## Фразы из озвучки

- «главная мысль простая: меньше — значит лучше»
- «запомните одно слово — скорость»
- «система взломана» (с glitch)
- «быстрее, дешевле, надёжнее» (cycle по словам)

## Визуальный стиль

Нейтральный `inline-block` span; типографика из `style`/`className`.
Характер задают easing, `split` и `splitStagger`; glitch даёт «хакерский» вид.

## Входные данные

`AnimatedTextProps`: `children` (строка), `className?`, `style?`,
`transition?: AnimatedTextTransitionProps` =
`TransformProps & VisualProps & TimingProps &`
- `split?: "none" | "word" | "character" | "line" | string` (по умолчанию `"none"`);
- `splitStagger?: number` (кадры между фрагментами, 0);
- `glitch?: AnimatedValue` (доля подменяемых символов 0…1, например `[1, 0]`);
- `cycle?: { texts: string[]; itemDuration: number }`.

Трансформы `x y z scale scaleX scaleY rotate rotateX rotateY rotateZ skew
skewX skewY transform`, визуал `opacity color backgroundColor blur`, тайминг
`frames? duration? delay? (0) easing?`. Без `duration`: 30 кадров внутри
`Step`, иначе `fps`.

## Анимации

Каждый фрагмент получает прогресс `useMotionTiming` (кадр − delay −
index·stagger) → `buildMotionStyles` (transform, opacity, filter blur, цвет
в oklch). Glitch — `random(seed с кадром)` из `remotion`, детерминирован.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/components/AnimatedText.tsx` — компонент
- `templates/remotion-components/remotion-bits/src/utils/motion/index.ts` — тайминг и стили
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/animated-text.mdx` — справка
- `templates/remotion-components/remotion-bits/docs/src/bits/examples/animated-text/WordByWord.tsx` — пример

## Зависимости

`remotion` (`useCurrentFrame`, `useVideoConfig`, `random`); внутренние
`utils/motion`, `utils/color` (culori), `utils/interpolate`; транзитивно `three`.

## Совместимость и адаптация

`native`: всё вычисляется из кадра. Осторожно: `useMotionTiming` вызывается
внутри `units.map` — при `cycle` с фразами разной длины число хуков меняется
между кадрами (нарушение правил хуков React). Для `cycle` держать фразы с
одинаковым числом фрагментов или split `"none"`.

## Паттерны

`key-point-emphasis`, `sequence-steps`, `abstract-concepts`
