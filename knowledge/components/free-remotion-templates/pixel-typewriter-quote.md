# Pixel Typewriter Quote — `free-remotion-templates/pixel-typewriter-quote`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Цитата печатается по одному символу пиксельным битмап-шрифтом 5×7:
свежий символ вспыхивает акцентом и остывает до цвета чернил, за курсором
мигает блок; крупные пиксельные кавычки обрамляют текст, затем
допечатывается подпись автора. Поверх — CRT-скан-линии, шум, виньетка.

## Когда использовать

Цитата дня, эпиграф, высказывание эксперта в ретро/гик-стилистике. Для
обычного шрифта — `typewriter`. Кириллица не поддерживается битмапом.

## Фразы из озвучки

- «как говорил Кент Бек…»
- «есть одна фраза, которую стоит запомнить»
- «эту мысль сформулировали ещё в девяностые»

## Визуальный стиль

Внутреннее разрешение 480×270 с пиксельным апскейлом, тёмный `#0c0e1a`,
чернила `#dfe7ff`, акцент `#39e0c8`, спокойные градиентные полосы фона,
CRT-оверлеи. Шрифт — собственный битмап `pixel-kit/font.ts` (латиница,
цифры, пунктуация). 1920×1080, 180 кадров (6 с), 30 fps.

## Входные данные

`PixelTypewriterQuoteProps`: `quote` («Make it work, make it right, make
it fast.»), `attribution` («- Kent Beck»), `backgroundColor` (`#0c0e1a`),
`inkColor` (`#dfe7ff`), `accentColor` (`#39e0c8`), `cps` (0.55 символа на
кадр).

## Анимации

`revealed = floor(frame·cps)`; цвет символа `lerpRGB(accent, ink,
age/4)`; курсор мигает `floor(frame/8) % 2`; подпись стартует после
тела + 8 «символов» паузы; линия под текстом растёт с долей набранного.
Перенос строк — жадный по словам.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/pixel-typewriter-quote/PixelTypewriterQuote.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/index.ts` — реэкспорт pixel-kit
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/render.tsx` — `PixelStage`
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/fx.tsx` — `PixelDither`, `CrtScanlines`, `CrtNoise`, `CrtVignette`
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/font.ts` — битмап-шрифт
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`useCurrentFrame`, `AbsoluteFill`), внутренний `src/pixel-kit`.

## Совместимость и адаптация

`native`, детерминировано. Подобрать `cps` под длину цитаты, чтобы
подпись успела допечататься до конца композиции. Переносить вместе с
`src/pixel-kit/`.

## Паттерны

`key-point-emphasis`
