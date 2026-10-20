# Step-Aware Motion Timing (bit) — `remotion-bits/bit-3d-step-timing-context`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `3d-camera` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Четыре «слайда» в глубину сцены с подзаголовками и анимированным текстом;
камера переходит между ними. Демонстрирует, что анимации внутри `Step`
автоматически стартуют от входа в шаг (`useMotionTiming` + StepTimingContext),
а явные `frames` это перекрывают.

## Когда использовать

Как шаблон многослайдовой презентации, где каждый слайд имеет свои
вложенные анимации без ручного пересчёта кадров. Визуально — учебный пример;
для эффектной подачи лучше `bit-3d-basic`/`bit-3d-elements`.

## Фразы из озвучки

- «на каждом этапе — свои детали»
- «перейдём к следующему пункту и разберём его»
- «и в итоге всё складывается в одну картину»

## Визуальный стиль

Серые подписи (`#666`/`#999`), крупный текст 6 vmin, итоговый зелёный
`#4CAF50`; 300 кадров, 1920×1080, шаги по 100 кадров, переход 40.

## Входные данные

Без props: тексты слайдов зашиты. Шаги: y и z растут (z 0/300/600/900 vmin).

## Анимации

Вход/выход шагов (opacity, y, scale); внутри — `AnimatedText`
(opacity/y/scale, duration 25–30, одна с `frames: [140,180]`, одна с
`delay` 10) и `StaggeredMotion` (stagger 8, три `h1`).

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/scene-3d/StepTimingContext.tsx` — сцена с `metadata` (отдельной mdx нет)

## Зависимости

`remotion-bits` (`Scene3D`, `Step`, `AnimatedText`, `StaggeredMotion`,
`useViewportRect`). См. `remotion-bits/scene-3d`, `remotion-bits/animated-text`.

## Совместимость и адаптация

`native`. Но `AnimatedText` получает детьми `<h1>`-элементы, а компонент
приводит не-строку к `String(children)` — вероятно, на экране будет
«[object Object]» вместо «Step 1» и др. (по коду; рендер не проверялся).
Исправить: передавать строку и стилизовать через `style` у `AnimatedText`.

## Паттерны

`sequence-steps`, `timeline`
