# MobileDetail — `animata/mobile-detail`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Тёмный виджет 208×208 «состояние телефона»: 2×2 плитки Battery 25%,
Volume 50%, Ram 75%, Storage 90%, каждая залита снизу на свой процент.

## Когда использовать

Ресурсы устройства/сервера, «память почти заполнена», сравнение 4
процентов. Кольцевой вариант — `animata/battery-level`.

## Фразы из озвучки

- «память заполнена на девяносто процентов»
- «оперативка под нагрузкой»
- «батарея садится»

## Визуальный стиль

zinc-900/800, заливка stone-700, мелкие иконки и подписи zinc-400;
минималистичный dark UI.

## Входные данные

Без props: `progressBarsData` `{label, value, max, icon}` в файле.

## Анимации

Только hover: цвет подписей/иконок (`transition-colors`).

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/mobile-detail.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/mobile-detail.mdx` — документация
- `templates/react-libriry/animata/animata/widget/mobile-detail.stories.tsx` — пример

## Зависимости

`lucide-react`.

## Совместимость и адаптация

`adaptable`: вынести данные в props; заливку анимировать `height:
${pct*progress}%` с `progress` из кадра (stagger по плиткам).

## Паттерны

`quantities`, `comparison`
