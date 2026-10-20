# ReferenceDot — `recharts/reference-dot`

| Поле | Значение |
|---|---|
| Репозиторий | `recharts` (`templates/infografika/recharts`) |
| Вид | component |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Отдельная точка-маркер в координатах данных (`x`, `y`) поверх
декартова графика, с подписью: пик, минимум, событие.

## Когда использовать

Ткнуть в конкретное значение: рекорд, точку перелома, «мы сейчас здесь».
Для порога — `recharts/reference-line`, для периода —
`recharts/reference-area`.

## Фразы из озвучки

- «вот он, исторический максимум»
- «в этой точке тренд развернулся»
- «мы сейчас находимся здесь»

## Визуальный стиль

Круг радиуса `r` (10) с заливкой и обводкой, подпись рядом; акцентный
цвет.

## Входные данные

`ReferenceDotProps`: `x`, `y` (значения домена), `r` (10), `xAxisId`/
`yAxisId` (0), `ifOverflow`, `shape` (элемент | функция(`DotProps`)),
`label`, `zIndex` (600), обработчики `onClick`/`onMouse*`, SVG-атрибуты
`Dot` (`fill`, `stroke`, `strokeWidth`).

## Анимации

Нет: статичный `Dot`.

## Исходники и документация

- `templates/infografika/recharts/src/cartesian/ReferenceDot.tsx` — компонент
- `templates/infografika/recharts/storybook/stories/API/cartesian/ReferenceDot.stories.tsx` — примеры

## Зависимости

`recharts` (`Dot`, `Label`); только внутри декартова чарта.

## Совместимость и адаптация

`adaptable`. «Пульс»/появление — `r={spring(...)*10}` или
`shape`-функция с кольцом расходящейся волны от кадра; подпись
проявлять отдельно. Обработчики мыши не нужны. См.
`knowledge/compatibility/recharts.md`.

## Паттерны

`key-point-emphasis`
