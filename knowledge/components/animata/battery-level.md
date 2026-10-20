# BatteryLevel — `animata/battery-level`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `css-transition`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Виджет 208×208 «батареи устройств» как в iOS: сетка 2×2 кольцевых
индикаторов (DonutChart) с иконками Apple / телефон / ноутбук / часы и
уровнями 100/40/80/20%.

## Когда использовать

Mockup экосистемы гаджетов, «заряд устройств», сравнение нескольких
процентов в одном тайле. Один уровень — `animata/battery`.

## Фразы из озвучки

- «все ваши устройства заряжены»
- «часам осталось всего двадцать процентов»
- «экосистема под контролем»

## Визуальный стиль

Инверсный фон `bg-foreground`, кольца толщиной 10px, зелёный прогресс;
rounded-3xl.

## Входные данные

Без props: массив `items` `{level, icon}` в файле.

## Анимации

`DonutChart`: через `setTimeout(250)` выставляет `strokeDashoffset`, кольцо
заполняется CSS-переходом `duration-500`.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/battery-level.tsx` — виджет
- `templates/react-libriry/animata/animata/graphs/donut-chart.tsx` — кольцо
- `templates/react-libriry/animata/content/docs/widget/battery-level.mdx` — документация
- `templates/react-libriry/animata/animata/widget/battery-level.stories.tsx` — пример

## Зависимости

`lucide-react`, `animata/graphs/donut-chart`.

## Совместимость и адаптация

`adaptable`: передавать в `DonutChart` `progress = level *
interpolate(frame, [0, 20], [0, 1])` и убрать хак с таймером/transition
(в копии DonutChart `shouldUseValue = true`). Вынести `items` в props.

## Паттерны

`quantities`, `comparison`
