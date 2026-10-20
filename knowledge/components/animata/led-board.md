# LEDBoard — `animata/led-board`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `css-animation`, `css-transition`, `timers`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Светодиодное табло: SVG-матрица точек на тёмной панели, слово выложено
«горящими» точками; часть точек слова случайно вспыхивает фиолетовым,
при hover слово загорается целиком волной слева направо.

## Когда использовать

Табло, вывеска, ретро-дисплей, «объявление», счёт/число на табло (цифры
0–9 поддержаны).

## Фразы из озвучки

- «на табло — …»
- «загорается надпись»
- «табло показывает 2024»

## Визуальный стиль

Ретро-техно, `rounded-xl` панель с градиентом `zinc-950/900`, точки
`fill-zinc-800`, вспышки `#a855f7`/`fill-purple-500`.

## Входные данные

`word: string` (`"COPY"`). Поддержаны символы `C O P Y` пробел и `0–9`
(`charMap`); для других букв добавить матрицы 6 строк.

## Анимации

`setInterval(3000)` пересчитывает `seededRandom(row, col, salt)` — ~20 %
горящих точек получают `animate-led` (`led 100ms`, но `animationDuration:
2000ms`, delay до 1000 мс); hover — `transition-colors` с
`transitionDelay: col·15 ms`.

## Исходники и документация

- `templates/react-libriry/animata/animata/card/led-board.tsx` — компонент
- `templates/react-libriry/animata/styles/globals.css` — `--animate-led`, `@keyframes led`
- `templates/react-libriry/animata/content/docs/card/led-board.mdx` — документация
- `templates/react-libriry/animata/animata/card/led-board.stories.tsx` — пример

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

Рандом уже детерминированный (`seededRandom`) — salt брать
`floor(frame/(3·fps))` вместо `setInterval`; вспышку точки считать из
локального времени (`fill` по ключам keyframes `led`). «Загорание волной» —
точка в столбце c горит, если `frameMs ≥ start + c·15`.

## Паттерны

`key-point-emphasis`, `quantities`
