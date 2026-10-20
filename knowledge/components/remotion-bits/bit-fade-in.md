# Fade In (bit) — `remotion-bits/bit-fade-in`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Текст целиком проявляется из прозрачности за 1 секунду. Без сдвигов и
масштаба.

## Когда использовать

Спокойные подписи, титры, примечания, второстепенный текст рядом с
активной анимацией. Если текст нужно выделить, бери `bit-blur-slide-word`
или `bit-char-by-char`.

## Фразы из озвучки

- «на экране — итоги квартала»
- «источник: открытые данные»
- «спасибо за внимание»

## Визуальный стиль

Минимализм, нейтральный тон. Шрифт и цвет приходят от родителя. 90 кадров,
1920×1080.

## Входные данные

Props нет. Текст «Hello World». `transition: { opacity: [0, 1] }`,
`split` по умолчанию `none`, длительность равна `fps`.

## Анимации

Линейная смена opacity 0 → 1 от кадра 0.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/animated-text/FadeIn.tsx` — сцена
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/fade-in.mdx` — документация
- карточка компонента: `components/remotion-bits/animated-text.md`

## Зависимости

`remotion-bits` (`AnimatedText`).

## Совместимость и адаптация

`native`. Для такой простой задачи достаточно и `interpolate` из remotion.

## Паттерны

`key-point-emphasis`
