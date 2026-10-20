# Highlighter — `magicui/highlighter`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | complex |
| Флаги | `engine:other`, `svg`, `dom`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Фрагмент текста выделяется «от руки»: маркерная заливка,
подчёркивание, обводка рамкой или кругом, зачёркивание, скобки —
неровным SVG-штрихом, который прорисовывается.

## Когда использовать

Выделить ключевые слова внутри фразы на экране: «обратите внимание»,
«главное здесь — …», «это неверно» (crossed-off). Для акцента на целом
заголовке — текстовые эффекты (`aurora-text`).

## Фразы из озвучки

- «обратите внимание на эти два слова»
- «вот это — ключевое»
- «забудьте старый подход» (зачёркивание)

## Визуальный стиль

Рукописный, «маркер в тетради», мягкий пастельный цвет по умолчанию
`#ffd1dc`; штрих 1.5 px, 2 прохода.

## Входные данные

- `children: ReactNode`
- `action?: "highlight"|"underline"|"box"|"circle"|"strike-through"|"crossed-off"|"bracket"` = `"highlight"`
- `color?` = `"#ffd1dc"`, `strokeWidth?` = `1.5`, `animationDuration?` = `600` (мс)
- `iterations?` = `2`, `padding?` = `2`, `multiline?` = `true`, `isView?` = `false`

## Анимации

`annotate(element, config).show()` из `rough-notation` в
`useLayoutEffect`: пакет сам строит SVG поверх элемента и анимирует
прорисовку (внутренняя анимация пакета — исходника пакета в
репозитории нет). `ResizeObserver` перерисовывает; `useInView` — при
`isView`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/highlighter.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/highlighter.mdx` — документация
- `templates/react-libriry/magicui/apps/www/registry/example/highlighter-demo.tsx` — пример

## Зависимости

`rough-notation`, `motion` (`useInView`).

## Совместимость и адаптация

`complex`: анимацию и случайность штриха контролирует сторонний пакет
по своему времени. Вариант: `animate: false` + `show()` в `useEffect`
под `delayRender`, затем найти вставленные `path` и рисовать их по
кадру через `stroke-dashoffset`; либо воспроизвести штрих своим
SVG-путём (roughjs с фиксированным `seed`). Детерминизм штриха при
повторном рендере не проверялся.

## Паттерны

`key-point-emphasis`, `comparison`
