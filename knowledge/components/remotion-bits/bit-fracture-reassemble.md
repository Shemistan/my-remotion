# Fracture Reassemble (bit) — `remotion-bits/bit-fracture-reassemble`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `transitions-scene` |
| Совместимость с Remotion | native |
| Флаги | `external-service` |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Сетка 5×5 фото-плиток собирается из осколков, разбросанных в 3D (x/y/z и
вращения по трём осям), держится ~60 кадров и снова разлетается; в
центральном ряду поверх фото — абстрактные символы ◈ ◉ ◎ ◍ ◌.

## Когда использовать

Метафора «собрать картину из частей», «хаос → порядок», распад/разрушение
старого, драматичный переход между сценами. Для спокойного появления
сетки — `bit-grid-stagger`, для перестройки раскладки — `bit-mosaic-reframe`.

## Фразы из озвучки

- «из разрозненных кусочков складывается цельная картина»
- «всё рассыпалось — и собралось заново»
- «из хаоса рождается порядок»

## Визуальный стиль

Тёмный фон, квадратные плитки с радиусом `vmin*1.5` и тонкой обводкой
`--color-border-dark`, фото `object-fit: cover`, белые символы с тенью;
180 кадров, 1080×1080, кинематографичный easeInOutCubic.

## Входные данные

Без props: `ROWS = COLS = 5`, `SYMBOLS`, `tileSize = vmin*14`, `gap =
vmin*1.2`; разброс — детерминированный `randomFloat(seed, min, max)`
(`frac-x-${i}` и т.д.). Картинки — `https://picsum.photos/seed/${seed}/${size}/${size}`.

## Анимации

На каждую плитку `StaggeredMotion` с ключевыми кадрами
`[разброс, 0, hold(60), разброс]` для x, y, z, rotateX/Y/Z и opacity
`[0, 1, hold(60), 0]`; `duration: 170`, `delay = манхэттенское расстояние
от центра × 4`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/staggered-motion/FractureReassemble.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/fracture-reassemble.mdx` — страница bit

## Зависимости

`remotion-bits`: `StaggeredMotion`, `useViewportRect`, `randomFloat`, `hold`.

## Совместимость и адаптация

Анимация `native`, но картинки грузятся обычным `<img>` с внешнего
picsum.photos: в рендере кадр может уйти до загрузки. Заменить на `Img` из
`remotion` (ждёт загрузки) и локальные `staticFile(...)`. Определить
`--color-background-dark`, `--color-border-dark`.

## Паттерны

`transformation`, `system-structure`, `abstract-concepts`
