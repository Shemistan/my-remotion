# ReferenceArea — `recharts/reference-area`

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

Подсвеченный прямоугольник на декартовом графике между `x1…x2` и/или
`y1…y2` в координатах данных: период, коридор нормы, зона риска.

## Когда использовать

Выделить интервал времени («кризис», «акция», «сезон») или диапазон
значений («зона нормы»). Для одного порога — `recharts/reference-line`.

## Фразы из озвучки

- «весь этот период продажи стояли на месте»
- «пока показатель в зелёной зоне — всё в порядке»
- «во время кампании трафик удвоился»

## Визуальный стиль

Полупрозрачная заливка (`fill`, `fillOpacity`), опционально контур,
подпись внутри (`label={{ position: 'insideTop' }}`).

## Входные данные

`ReferenceAreaProps`: `x1`, `x2`, `y1`, `y2` (значения домена; если не
задано — до края области), `xAxisId`/`yAxisId` (0), `ifOverflow`,
`shape`, `label`, `zIndex` (100), `children`, SVG-атрибуты
`Rectangle` (`fill`, `fillOpacity`, `stroke`, `radius`).

## Анимации

Нет: статичный `Rectangle` (его собственные `isAnimationActive`/
`isUpdateAnimationActive` по умолчанию `false`).

## Исходники и документация

- `templates/infografika/recharts/src/cartesian/ReferenceArea.tsx` — компонент
- `templates/infografika/recharts/src/shape/Rectangle.tsx` — фигура
- `templates/infografika/recharts/storybook/stories/API/cartesian/ReferenceArea.stories.tsx` — примеры

## Зависимости

`recharts`; только внутри декартова чарта.

## Совместимость и адаптация

`adaptable`. «Заливка» интервала по кадру — `x2` от `x1` к целевому
значению (числовая ось) либо `fillOpacity={interpolate(frame, …)}`;
для категориальной оси — `shape`-функция с `<rect width={w * p}>`. См.
`knowledge/compatibility/recharts.md`.

## Паттерны

`key-point-emphasis`, `timeline`
