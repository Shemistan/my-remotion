# Lower Third (bit) — `remotion-bits/bit-lower-third`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `layout-templates` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Телевизионная плашка внизу слева: вертикальная акцентная полоса
вырастает, затем выезжают имя (крупно) и должность (капсом с точкой),
держатся и уезжают в обратном порядке.

## Когда использовать

Представление спикера, эксперта, героя интервью; подпись места/события.
Для заголовка сцены по центру — `bit-blur-slide-word`/`bit-fade-in`.

## Фразы из озвучки

- «с нами главный архитектор проекта»
- «рассказывает руководитель продукта»
- «знакомьтесь — Ада Лавлейс»

## Визуальный стиль

Широкоформат 1920×1080, радиальный фон из `--color-surface-light/dark`,
белое имя `vmin*6.5` жирным, должность `--color-primary-hover` uppercase с
разрядкой, полоса `--color-primary`; вещательный ритм: вход 25, выход 20
кадров, всего 150.

## Входные данные

Без props: `name = "Ada Lovelace"`, `title = "Analytical Engine
Programmer"`, `total = 150`, `enter = 25`, `exit = 20`; позиция `left:
vw*6`, `bottom: vh*10`.

## Анимации

Полоса: `scaleY: [0, 1, hold(holdFrames), 0]`, `duration: 150`;
имя: `x/opacity: [-shift → 0, hold, → -shift]`, `delay: 6`; должность —
то же с `delay: 12`; easeInOutCubic / easeOutCubic.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/staggered-motion/LowerThird.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/lower-third.mdx` — страница bit

## Зависимости

`remotion-bits`: `StaggeredMotion`, `hold`, `useViewportRect`.

## Совместимость и адаптация

`native`. Вынести `name`/`title`/`total` в props; фон сцены убрать, чтобы
класть плашку поверх видео (`<OffthreadVideo>` под ней). Определить
CSS-переменные цветов.

## Паттерны

`key-point-emphasis`
