# BodyCopy — `remotion-boilerplate/body-copy`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-boilerplate` (`templates/remotion-components/remotion-boilerplate`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | UNLICENSED (package.json, README); файла LICENSE нет — только референс идей |

## Что визуализирует

Абзац/подзаголовок, проявляющийся по словам с лёгким подъёмом на 12 px.

## Когда использовать

Референс спокойного вторичного текста под заголовком, пункт списка. Для
посимвольного удара — `kinetic-burst`.

## Фразы из озвучки

- «коротко о том, что мы делаем»
- «а теперь подробнее»
- «в двух словах»

## Визуальный стиль

32 px, 400, `SF Pro Text, Helvetica, Arial`, белый 75 %, по центру,
`maxWidth 900`, межстрочный 1.6.

## Входные данные

`BodyCopyProps`: `text: string`, `startFrame?` (0), `durationInFrames?` (35).

## Анимации

`AnimatedText`: `split: "word"`, `splitStagger: 1`, `frames: [startFrame,
startFrame + durationInFrames]`, opacity 0→1, y 12→0, `easeOutQuart`.

## Исходники и документация

- `templates/remotion-components/remotion-boilerplate/src/BodyCopy.tsx` (README указывает `components/text/BodyCopy.tsx`, такого файла нет)

## Зависимости

`remotion`, `remotion-bits`.

## Совместимость и адаптация

`native`. UNLICENSED: без явной лицензии переиспользование кода юридически
не разрешено — только как референс идей.

## Паттерны

`key-point-emphasis`
