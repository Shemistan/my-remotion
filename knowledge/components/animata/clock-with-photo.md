# ClockWithPhoto — `animata/clock-with-photo`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `user-events`, `css-transition`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md); фото — Unsplash + `public/jumping-man.png` |

## Что визуализирует

Фото-виджет 208×208 в духе iOS Depth Effect: пейзаж на фоне, вырезанная
фигура прыгающего человека слева поверх, справа огромные белые цифры
часов ЧЧ/ММ в две строки (за фигурой). По наведению фигура уезжает,
цифры сдвигаются.

## Когда использовать

«Время», «каждая минута на счету», lifestyle-mockup экрана блокировки.

## Фразы из озвучки

- «время летит незаметно»
- «каждая минута на счету»
- «сейчас самое время начать»

## Визуальный стиль

Фото на всю карточку, text-8xl font-black tabular-nums, белые цифры;
эффектно, «Apple-like».

## Входные данные

Без props. Время — `new Date()` (часы/минуты), фон — Unsplash URL,
фигура — `absoluteUrl("/jumping-man.png")`.

## Анимации

`setTimeout` до начала следующей минуты обновляет время; hover:
`translate-x-full opacity-0` фигуры, `scale-105 blur` фона, сдвиг цифр
(`transition-all duration-500`).

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/clock-with-photo.tsx` — виджет
- `templates/react-libriry/animata/public/jumping-man.png` — фигура
- `templates/react-libriry/animata/content/docs/widget/clock-with-photo.mdx` — документация
- `templates/react-libriry/animata/animata/widget/clock-with-photo.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`absoluteUrl`, `cn`).

## Совместимость и адаптация

`adaptable`: таймер обновляет только данные — заменить на prop `time` или
время из кадра (`startTime + frame/fps`). Картинки через `staticFile`.
Hover-сдвиг можно проиграть по кадру как «раскрытие». Лицензия
`jumping-man.png` не указана — уточнить перед публикацией.

## Паттерны

`timeline`, `key-point-emphasis`
