# Easings Visualizer (bit) — `remotion-bits/bit-easings-visualizer`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Девять дорожек с подписями (`linear`, `easeInQuad` … `spring`, `steps(5)`);
по каждой синий квадрат должен проезжать слева направо за 60 кадров с
соответствующим easing — наглядное сравнение кривых.

## Когда использовать

Обучающие ролики про анимацию и UX-моушн, объяснение «плавно vs резко»,
подбор easing для проекта. Не для данных — это справочная сцена.

## Фразы из озвучки

- «посмотрите, как по-разному ведут себя кривые ускорения»
- «линейное движение выглядит механически»
- «пружина даёт лёгкий перелёт»
- «ступенчатая анимация — как в старых играх»

## Визуальный стиль

Почти чёрный фон `#09090b`, моноширинные подписи zinc-200, разделители
zinc-800, квадрат blue-500 со свечением; подпись «Duration: 60 frames».
90 кадров, 1080×1080.

## Входные данные

Без props: массив `EASINGS: {label, value: EasingName | EasingFunction}[]`
(в т.ч. `steps(5)` из remotion-bits); размеры дорожек от
`useViewportRect()` (width/height).

## Анимации

`StaggeredMotion` с `x: [0, travelDistance]`, `frames: [0, 60]`,
`duration: 60`, `easing: item.value`, `cycleOffset={0}`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/staggered-motion/EasingsVisualizer.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/easings-visualizer.mdx` — страница bit

## Зависимости

`remotion-bits`: `StaggeredMotion`, `useViewportRect`, `steps`, типы
`EasingName`/`EasingFunction`.

## Совместимость и адаптация

`native` по механизму (useCurrentFrame внутри useMotionTiming). **Подозрение
на баг по коду:** `cycleOffset={0}` → в `useMotionTiming` `baseFrame =
cycleOffset - delay = 0` на каждом кадре, прогресс всегда 0 — квадраты
могут стоять на месте. Перед использованием убрать `cycleOffset` (или
передавать `frame`); проверить рендером.

## Паттерны

`comparison`, `abstract-concepts`
