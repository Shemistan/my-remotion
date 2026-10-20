# GradientTransition — `remotion-bits/gradient-transition`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Полноэкранный фон с CSS-градиентом, плавно перетекающим через цепочку
градиентов: линейный, радиальный, конический; меняются цвета (в oklch),
угол (по кратчайшему пути), позиции стопов и центр.

## Когда использовать

Подложка под текст и сцены, смена настроения («было мрачно — стало
светло»), смена разделов ролика, вращающийся конический фон. Под детали
поверх фона кладутся `children`. Для частиц — `particle-system`.

## Фразы из озвучки

- «настроение меняется»
- «от холодного к тёплому»
- «переходим к следующей главе»

## Визуальный стиль

Чистый CSS-градиент `position:absolute; 100%×100%`, без шума и текстур.
Темп задаётся easing и длительностью.

## Входные данные

`GradientTransitionProps`: `gradient: string[]` (CSS-строки
`linear-/radial-/conic-gradient(...)`); `frames?: [start, end]`;
`duration?` (кадры; по умолчанию длительность композиции); `delay?` (0);
`easing?` (имя или функция, "linear"); `shortestAngle?` (true); `className?`,
`style?`, `children?`.

## Анимации

Прогресс `clamp((frame − delay − start)/duration)` → `interpolateGradientKeyframes`:
парсинг строк, нормализация и выравнивание числа стопов, интерполяция цвета
culori в oklch, угла и позиции. Тип градиента переключается на середине
сегмента (скачок при смене radial ↔ linear).

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/components/GradientTransition.tsx` — компонент
- `templates/remotion-components/remotion-bits/src/utils/gradient.ts` — парсер и интерполяция
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/gradient-transition.mdx` — справка
- `templates/remotion-components/remotion-bits/docs/src/bits/examples/gradient-transition/LinearGradient.tsx` — пример

## Зависимости

`remotion` (`useCurrentFrame`, `useVideoConfig`), `culori`; внутренние
`utils/gradient`, `utils/interpolate`.

## Совместимость и адаптация

`native`. Парсер упрощённый: углы только в `deg` или `to <сторона>`,
позиции стопов только `%`/`px`, ключевые слова цветов — короткий список
(см. `isColorStop`); сложные синтаксисы (несколько слоёв, `in oklch`,
`repeating-*`) не разбираются — тогда строка возвращается как есть.

## Паттерны

`transformation`, `abstract-concepts`
