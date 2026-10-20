# Scramble Text — `free-remotion-templates/scramble-text`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

«Расшифровка»: над текстом метка `[ DECRYPTING ]`, символы основной
строки перебирают случайные знаки и фиксируются слева направо; по тексту
бежит скан-линия, после расшифровки строка загорается неоновым свечением.

## Когда использовать

Раскрытие секрета/пароля, «доступ получен», кибербезопасность, хакерская
эстетика, момент «разгадки». Для сбоя — `glitch-text`, для печати —
`typewriter`.

## Фразы из озвучки

- «доступ разрешён»
- «и вот мы расшифровали сообщение»
- «за этим кодом скрывается ответ»

## Визуальный стиль

Почти чёрный `#05080f` с тонкими горизонтальными линиями, кислотно-зелёный
`#00ff9c` текст 180px weight 700, серо-зелёная метка моноширинным
`"SF Mono", "Menlo", "Consolas", monospace`; основной текст — системный
`-apple-system, "Segoe UI", Roboto, sans-serif`. 1920×1080, 150 кадров
(5 с), 30 fps.

## Входные данные

`ScrambleTextProps`: `text` («ACCESS GRANTED»), `label?` («DECRYPTING»),
`background` (`#05080f`), `textColor` (`#00ff9c`), `labelColor`
(`#7a9a8c`), `scrambleDuration` (60 кадров), `charset`
(«A–Z0–9!@#$%&*+=?/<>»).

## Анимации

Внутренний `Scramble`: progress 14→14+scrambleDuration
(`Easing.out(ease)`), `resolvedCount = floor(progress·len)`; остальные
символы — `charset[seededRandom(frame·31 + i·97)]` (sin-хеш,
детерминирован). Метка 0→12; свечение после расшифровки (+12…+24);
скан-линия `(frame·6) % 200`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/scramble-text/ScrambleText.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`interpolate`, `Easing`, `useCurrentFrame`), `react`.

## Совместимость и адаптация

`native`. Пропорциональный шрифт — ширина строки «дышит» при переборе;
для стабильной ширины переключить основной текст на моноширинный.

## Паттерны

`key-point-emphasis`, `transformation`
