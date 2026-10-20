# StackedSections — `animata/stacked-sections`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `interactive-widgets` |
| Совместимость с Remotion | unsuitable |
| Флаги | `user-events`, `dom`, `raf` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Колода «глав»: каждая секция-ребёнок при прокрутке прилипает (sticky)
сверху со смещением 48px, следующая наезжает поверх, а накрытые слегка
уменьшаются — видны полоски-«корешки» предыдущих.

## Когда использовать

В видео — только как идея «карточки накрывают друг друга»; механизм —
прокрутка страницы.

## Фразы из озвучки

- «глава за главой»
- «каждый шаг ложится поверх предыдущего»

## Визуальный стиль

Нейтральная обёртка; вид задают дочерние панели; масштаб покрытых
`1.1 − 0.1 × глубина`.

## Входные данные

`children` (по панели на ребёнка), `withDramaEffect = true`,
`stackOffset = 48`, `paneGap: false | string = "gap-2"`,
`scrollRunway = "0px"`, `className?`.

## Анимации

`position: sticky` + слушатель `scroll` (window или ближайший
скролл-контейнер) → `requestAnimationFrame` → `getBoundingClientRect`
следующей карточки → inline `scale` на контенте.

## Исходники и документация

- `templates/react-libriry/animata/animata/scroll/stacked-sections.tsx` — компонент
- `templates/react-libriry/animata/animata/scroll/stacked-sections.css` — стили
- `templates/react-libriry/animata/content/docs/scroll/stacked-sections.mdx` — документация
- `templates/react-libriry/animata/animata/scroll/stacked-sections.stories.tsx` — пример

## Зависимости

React, `@/lib/utils`.

## Совместимость и адаптация

`unsuitable` как есть: без прокрутки ничего не происходит. Эффект проще
собрать заново: панели `absolute`, `translateY` i-й панели из
`interpolate(frame - i*step, [0, 0.6*step], [H, i*48])`, масштаб
предыдущих — по формуле `1.1 - 0.1*(total - (i-1))` по мере наезда.

## Паттерны

`sequence-steps`
