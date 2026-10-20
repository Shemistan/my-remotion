# Gradient interpolation — `remotion-bits/gradient`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Ничего не рисует; парсер CSS-градиентов (`linear/radial/conic`) и их
интерполяция — основа `gradient-transition`.

## Когда использовать

Нужна CSS-строка промежуточного градиента для своего элемента (кнопка,
текст с `background-clip`, рамка), а не полноэкранный фон.

## Фразы из озвучки

Косвенно:
- «цвета бренда переливаются»
- «рассвет сменяет ночь»
- «энергия нарастает»

## Входные данные

`parseGradient(str) → ParsedGradient | null` (`{type, angle?, shape?,
position?, stops: {color, position?}[]}`), `normalizeColorStops`,
`matchColorStopCount`, `interpolateAngle(from, to, p, shortest=true)`,
`interpolateGradients(from, to, p, easingFn?, shortest)`, `gradientToCSS`,
`interpolateGradientKeyframes(gradients[], progress, easingFn?, shortest)`.

## Анимации

Нет собственных.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/utils/gradient.ts` — реализация
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/gradient-transition.mdx` — справка (через компонент)

## Зависимости

`culori` (oklch-интерполяция цветов стопов).

## Совместимость и адаптация

`native`. Ограничения парсера: угол `Ndeg` или `to …`; позиции стопов `%`/
`px` (px трактуются как %); тип и форма переключаются скачком на p=0.5;
непарсимая строка возвращается без интерполяции.

## Паттерны

нет
