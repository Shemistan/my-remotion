# FlightWidget — `animata/flight-widget`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md); логотип авиакомпании — сторонний бренд с seeklogo.com |

## Что визуализирует

Посадочный талон 208×208: вертикальный корешок с названием авиакомпании
и логотипом, маршрут «TOR → NYC», гейт «A50» жёлтым, рейс «AC951», место
«1A», дата и время; вырезы-полукруги по краю как у билета.

## Когда использовать

Путешествия, командировки, «билет куплен», travel-сервисы. Для
расписания — `animata/calendar-event`.

## Фразы из озвучки

- «билет уже у вас в телефоне»
- «рейс из Торонто в Нью-Йорк»
- «посадка через гейт A50»

## Визуальный стиль

Голубые градиенты blue-100 → teal-100, розовый корешок, жирный шрифт,
teal-500 подписи; «бумажный» билет.

## Входные данные

Без props: маршрут, рейс, место, «AIR CANADA» и URL логотипа зашиты;
дата/время — `new Date()` (`en-GB`, 24h).

## Анимации

Нет; `setTimeout` один раз обновляет время в начале следующей минуты.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/flight-widget.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/flight-widget.mdx` — документация
- `templates/react-libriry/animata/animata/widget/flight-widget.stories.tsx` — пример

## Зависимости

`lucide-react` (`Armchair`); внешний логотип с `seeklogo.com`.

## Совместимость и адаптация

`adaptable`: вынести данные (авиакомпания, маршрут, рейс, дата) в props,
время фиксировать; **заменить бренд и логотип** (товарный знак, внешний
URL) на свои/нейтральные через `staticFile`. Вход — slide-in билета.
Вырезы `bg-white` должны совпадать с фоном сцены.

## Паттерны

`spatial`, `timeline`
