# WeatherCard — `animata/weather-card`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Виджет погоды 208×208: город, иконка «солнце с дождём», крупная
температура «19°», «Feels like 21°», плашка максимум/минимум (оранжевый
↑24°, синий ↓9°).

## Когда использовать

Погода, путешествия, контекст места/времени, «прогноз». Данные целиком
через props.

## Фразы из озвучки

- «в Токио сегодня девятнадцать градусов»
- «к вечеру похолодает до девяти»
- «отличная погода для прогулки»

## Визуальный стиль

Градиент `from-muted/80 to-muted`, 34px температура, полупрозрачная
плашка с blur; Apple-weather-like.

## Входные данные

`className?`, `city = "Tokyo"`, `temperature = 19`, `feelsLike = 21`,
`high = 24`, `low = 9`.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/weather-card.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/weather-card.mdx` — документация
- `templates/react-libriry/animata/animata/widget/weather-card.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils`; цвета темы.

## Совместимость и адаптация

`adaptable` без доработки; температура может докручиваться по кадру
(`Math.round(interpolate(...))`), карточка — scale-in.

## Паттерны

`quantities`, `spatial`
