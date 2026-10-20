# GlyphMatrix — `magicui/glyph-matrix`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Сетка моноширинных символов (`0 1 · • + * / \ < > =`) разной
прозрачности, в которой случайные ячейки тихо меняют символ;
затухает книзу. Спокойная «матрица».

## Когда использовать

Фон для тем кода, данных, ИИ, кибербезопасности — без агрессии
«Матрицы». Для дешифровки заголовка — `hyper-text`.

## Фразы из озвучки

- «под капотом — миллионы строк кода»
- «алгоритм непрерывно анализирует данные»
- «цифровой мир никогда не спит»

## Визуальный стиль

Серый `#6B7280`, ячейка 14 px, шрифт ui-monospace, прозрачность
0.05–0.5, затухание вниз 60 %; мутация каждые 90 мс.

## Входные данные

- `glyphs?` = `"01·•+*/\\<>="`, `cellSize?` = `14`
- `mutationRate?` = `0.04`, `interval?` = `90` (мс)
- `fadeBottom?` = `0.6`, `color?` = `"#6B7280"`
- `className?`, `style?`, атрибуты `canvas`.

## Анимации

Canvas 2D, `fillText` по сетке; `requestAnimationFrame`, раз в
`interval` мс меняет `floor(total·mutationRate)` случайных ячеек
(`Math.random`). `ResizeObserver` пересоздаёт сетку; цвет разбирается
через 1×1 canvas.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/glyph-matrix.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/glyph-matrix.mdx` — документация

## Зависимости

React, `cn`.

## Совместимость и адаптация

`complex`: состояние накапливается случайными мутациями. Переписать:
для ячейки `i` и тика `k = floor(t·1000/interval)` символ и альфа =
`random(\`${i}-${lastMutationTick(i, k)}\`)`, где тик мутации ячейки
определяется детерминированно (`random(\`${i}-${k}\`) < mutationRate`
с поиском назад ограниченной глубины) — или проще: каждая ячейка
меняется со своим периодом `random(i)`. Рисовать в `useEffect([frame])`,
шрифт загрузить заранее.

## Паттерны

`abstract-concepts`
