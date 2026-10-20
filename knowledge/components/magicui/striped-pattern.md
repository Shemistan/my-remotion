# StripedPattern — `magicui/striped-pattern`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Фон из тонких диагональных полос с наклоном влево или вправо (SVG
pattern), цвет — `currentColor`.

## Когда использовать

Штриховка зоны: «в разработке», «недоступно», «зона риска», выделение
области на схеме; лёгкая фактура фона.

## Фразы из озвучки

- «эта часть пока в разработке»
- «осторожно, зона риска»
- «здесь пока пусто»

## Визуальный стиль

Полосы 0.5 px, шаг 10 px; графичный, «чертёжный».

## Входные данные

- `direction?: "left"|"right"` = `"left"`
- `width?` = `10`, `height?` = `10` (размер тайла)
- `className?`, прочие атрибуты `svg`.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/striped-pattern.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/striped-pattern.mdx` — документация

## Зависимости

React, `cn`.

## Совместимость и адаптация

`adaptable`, адаптации не нужны. «Бегущая» штриховка — добавить
`patternTransform="translate(${frame % w} 0)"` (потребуется правка
компонента).

## Паттерны

`spatial`, `comparison`
