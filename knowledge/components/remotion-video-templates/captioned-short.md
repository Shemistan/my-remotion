# CaptionedShort — `remotion-video-templates/captioned-short`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-video-templates` (`templates/remotion-components/remotion-video-templates`) |
| Вид | template |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Вертикальный шорт 9:16 с «караоке»-субтитрами: крупные слова по центру,
текущее слово подсвечено акцентом и «подпрыгивает»; сверху заголовок-чип,
снизу полоска прогресса.

## Когда использовать

Субтитры под озвучку с пословными таймингами (Whisper и т.п.), рилсы,
шорты, TikTok. Без таймингов слов — `kinetic-text`.

## Фразы из озвучки

- «смотрите до конца — будет главное»
- «за минуту объясню, как это работает»
- «каждое слово, которое вы слышите, появляется на экране»

## Визуальный стиль

Тёмный градиент (`#0B1220` → темнее), белые слова Inter 800 / 118 px с
тенью, активное — `#FACC15`, неактивные opacity 0.55. 1080×1920, 30 fps.
Safe area для шортов (`SHORT_SAFE_AREA`).

## Входные данные

zod `captionedShortSchema`: `captions: {word, startMs, endMs}[]`
(по умолчанию — `public/captions.sample.json`, импорт JSON при сборке),
`title` («Programmatic captions»), `accentColor` (`#FACC15`),
`backgroundColor` (`#0B1220`), `mode: "single" | "group"` («group»),
`wordsPerGroup: int 1..6` (3).
`captionedShortCalculateMetadata`: fps 30, длительность = последний `endMs`
+ 20 кадров.

## Анимации

Текущее время `ms = frame/fps*1000`; активное слово по таймингам (в паузах
держится предыдущее); pop — `spring(SNAPPY)` от кадра начала слова, scale
0.7→1; прогресс-бар = ms / totalMs.

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/templates/CaptionedShort/CaptionedShort.tsx`
- `templates/remotion-components/remotion-video-templates/public/captions.sample.json`
- `templates/remotion-components/remotion-video-templates/README.md` — «Generating your own captions»

## Зависимости

`remotion`, `zod`, `@remotion/zod-types`, `lib/springs`, `lib/colors`,
`lib/fonts`, `lib/layout`.

## Совместимость и адаптация

`native`. Аудио в композицию не добавлено — подложить `<Audio>` самому.
Слова в режиме group не переносят строки по смыслу (просто по N).

## Паттерны

`key-point-emphasis`, `sequence-steps`
