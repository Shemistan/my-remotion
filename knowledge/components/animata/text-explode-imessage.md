# TextExplodeIMessage — `animata/text-explode-imessage`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | complex |
| Флаги | `engine:motion`, `raf`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Эффект iMessage «взрыв»: строка сжимается (scale 0.8, трекинг −10 %),
дрожит, затем буквы разлетаются по дуге со случайными поворотами и
увеличением, гаснут — и текст спокойно возвращается на место.

## Когда использовать

«Бум», сенсация, разрыв шаблона, взрывной рост, праздник. Один раз за
ролик.

## Фразы из озвучки

- «и тут всё взорвалось»
- «бум!»
- «эффект разорвавшейся бомбы»

## Визуальный стиль

Яркий, мультяшный; `text-3xl`, цвет через `className`.

## Входные данные

`text: string`, `mode?: "loop" | "hover"` (`"loop"`), `className?`.

## Анимации

`useAnimationControls`: последовательность `shrink` (1 с, easeOut) +
`jitter` → `explode` (для буквы: translateX/Y, rotate, scale, opacity по
4–5 ключам с `Math.random`) → `end` → `initial` (spring, delay 0.5); в
`loop` — повтор через `requestAnimationFrame`.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/text-explode-imessage.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/text-explode-imessage.mdx` — документация
- `templates/react-libriry/animata/animata/text/text-explode-imessage.stories.tsx` — пример

## Зависимости

`motion` (`useAnimationControls`, `Variants`).

## Совместимость и адаптация

`complex`: асинхронная цепочка `controls.start` с длительностями motion по
умолчанию (точные тайминги фаз explode/end в коде не заданы) и
`Math.random` при каждом запуске. Переписать как таймлайн из 4 фаз по
кадрам, параметры разлёта — `random(seed+i)` из remotion.

## Паттерны

`cause-effect`, `key-point-emphasis`
