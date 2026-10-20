# RemotionBits Promo (bit) — `remotion-bits/bit-remotion-bits-promo`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `layout-templates` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Промо-ролик библиотеки на 1140 кадров (1920×1080): камера `Scene3D` летает
между шагами intro → «Elements» (сетка 3×3 стеклянных карточек с частицами,
текстом, счётчиком, TypeWriter, CodeBlock, глитч-циклом, сменой слов) →
«Transitions» (мозаика 10×25 цветных плиток, волной от центра) → «Scenes»
(hero-баннер, дашборд с выручкой, уведомление «Render Complete», окно кода,
плеер) → outro. Заголовки и SVG-иконки (треугольник/квадрат/круг) переезжают
между шагами через `StepResponsive`.

## Когда использовать

Как образец/донор для обзорного «тура по возможностям» продукта, интро
канала, трейлера фич; когда озвучка перечисляет разделы и камера должна
«перелетать» к каждому. Для одиночной сцены — брать отдельные bits
(`bit-3d-basic`, `bit-grid-stagger`, `bit-counter-confetti`).

## Фразы из озвучки

- «вот что умеет наша библиотека»
- «сначала — элементы, потом — переходы, и наконец — целые сцены»
- «всё это собирается из готовых блоков»
- «давайте пролетим по всем возможностям»

## Визуальный стиль

Тёмный фон `--color-background-dark`, акцент `--color-primary(-hover)`,
полупрозрачные карточки с `backdropFilter: blur`, gruvbox-палитра у мозаики,
моноширинный шрифт; плавные пролёты камеры по 60 кадров.

## Входные данные

Без props: все тексты, позиции (`Transform3D` + `.toProps()`), палитры
зашиты в `Component`; размеры от `useViewportRect().vmin`. Шаги: `intro`,
`elements`, 9 × `element-*`, `transitions` (120), `scenes` (120), `outro` (120);
`stepDuration={60}`, `transitionDuration={60}`.

## Анимации

Камера Scene3D (slerp-интерполяция Transform3D), enter-transition шагов
`opacity+blur`, exitTransition (blur/opacity, transform), StaggeredMotion на
250 плитках с procedurally выбранными вариантами (seed через `random`),
AnimatedText (char/word split, glitch, cycle), AnimatedCounter, TypeWriter
(в т.ч. в `<Sequence from={20}>`), CodeBlock, Particles+Spawner+Behavior.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/showcase/FeatureShowcase.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/remotion-bits.mdx` — страница bit

## Зависимости

`remotion` (`AbsoluteFill`, `Sequence`, `random`); `remotion-bits`: AnimatedText,
AnimatedCounter, TypeWriter, CodeBlock, StaggeredMotion, Particles/Spawner/
Behavior, Scene3D/Step/Element3D/StepResponsive, Transform3D, Vector3,
useViewportRect (транзитивно `three`, `prism-react-renderer`, `culori`).

## Совместимость и адаптация

`native`: всё от `useCurrentFrame`, случайность — seeded `random`. Тяжёлая
сцена (250 плиток + частицы с replay-симуляцией) — рендер медленный.
Определить CSS-переменные темы; `backdropFilter` дорог в рендере. В
registryDependencies не указаны animated-counter/type-writer/code-block,
хотя используются.

## Паттерны

`system-structure`, `sequence-steps`, `key-point-emphasis`
