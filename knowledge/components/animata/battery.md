# Battery — `animata/battery`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Голубой градиентный виджет 208×208: маленькое белое кольцо заряда с
иконкой батареи сверху и крупное число процента снизу.

## Когда использовать

Один показатель «заряд/ресурс/энергия» в стиле системного виджета;
«батарейка садится». Несколько устройств — `animata/battery-level`.

## Фразы из озвучки

- «заряда хватит на весь день»
- «осталась половина»
- «энергия на исходе»

## Визуальный стиль

Градиент sky-600 → sky-400, белые элементы, число 34px tabular-nums.

## Входные данные

`className?`, `level = 50` (0–100).

## Анимации

`useEffect` при смене `level` ставит `transition: stroke-dashoffset 0.3s
linear` и новый `strokeDashoffset` (SVG-кольцо r=40).

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/battery.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/battery.mdx` — документация
- `templates/react-libriry/animata/animata/widget/battery.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: удалить `useEffect`, задать `strokeDashoffset =
((100 - lvl)/100) * circumference` прямо в разметке, где `lvl` — из
`interpolate(frame, …)`; число тоже от `lvl` (`Math.round`).

## Паттерны

`quantities`, `growth-decline`
