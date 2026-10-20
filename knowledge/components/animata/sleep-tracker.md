# SleepTracker — `animata/sleep-tracker`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `css-transition`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md); фото по умолчанию — Unsplash |

## Что визуализирует

Виджет 208×208 «Sleep Tracker»: красная точка-индикатор, фото-полоса
(спящий человек), мини-гистограмма фаз сна из 16 синих столбиков разной
прозрачности, «Activity 32m ago».

## Когда использовать

Сон/здоровье, «фазы сна за ночь», wellness-приложения. Соседи:
`animata/calorie-counter`, `animata/cycling`.

## Фразы из озвучки

- «как вы спали этой ночью»
- «фаза глубокого сна — под утро»
- «восстановление под контролем»

## Визуальный стиль

Белый (dark: slate-800), синие blue-600/400 столбики с альфой по
значению; спокойный, «медицинский».

## Входные данные

`items: {progress, label, className?, containerClassName?}[]` и `image:
string` (оба с дефолтами `testSleepTrackerProps`).

## Анимации

`BarChart` (graphs): `setTimeout(250)` → рост высот через
`transition-all duration-200`; высота 40px.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/sleep-tracker.tsx` — виджет
- `templates/react-libriry/animata/animata/graphs/bar-chart.tsx` — гистограмма
- `templates/react-libriry/animata/content/docs/widget/sleep-tracker.mdx` — документация
- `templates/react-libriry/animata/animata/widget/sleep-tracker.stories.tsx` — пример

## Зависимости

`animata/graphs/bar-chart`.

## Совместимость и адаптация

`adaptable`: высоты столбиков — из кадра (слева направо «ночь проходит»),
в копии BarChart убрать таймер; фото — `staticFile`.

## Паттерны

`timeline`, `quantities`
