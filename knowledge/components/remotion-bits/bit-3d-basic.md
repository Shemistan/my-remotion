# Basic 3D Scene (bit) — `remotion-bits/bit-3d-basic`

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

Три слова («Control», «Camera», «Action») расставлены в глубину сцены;
камера по очереди пролетает к каждому, слово проявляется при входе и гаснет
при уходе. Второе слово — белая плашка с чёрным текстом.

## Когда использовать

Короткий триптих тезисов с ощущением движения вперёд: «три шага», «три
слова о продукте». Для перечня без 3D — `staggered-motion`; для сложного
облёта — `bit-transform3d-showcase`.

## Фразы из озвучки

- «три слова: идея, код, запуск»
- «шаг за шагом мы движемся вперёд»
- «сначала контроль, потом камера, и — мотор!»

## Визуальный стиль

Минимализм: крупный `h1` (8 vmin) на фоне композиции, без декора;
150 кадров, 1920×1080, облёт `easeInOutCubic` 50 кадров.

## Входные данные

Без props: слова и позиции шагов зашиты (`y` и `z` растут на 10/200 vmin на
шаг). `useViewportRect()` для размеров. Для переиспользования вынести
массив слов в props.

## Анимации

`Scene3D` (`perspective` 1000, `transitionDuration` 50, `stepDuration` 50);
у каждого `Step` `transition: {opacity: [0,1]}`, `exitTransition: {opacity:
[1,0]}`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/scene-3d/3DBasic.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/basic-3d.mdx` — документация

## Зависимости

`remotion-bits` (`Scene3D`, `Step`, `useViewportRect`); registry: `scene-3d`.
См. карточку `remotion-bits/scene-3d`.

## Совместимость и адаптация

`native`. Цвет текста наследуется от обёртки — задать фон и `color`
самостоятельно.

## Паттерны

`sequence-steps`, `key-point-emphasis`, `spatial`
