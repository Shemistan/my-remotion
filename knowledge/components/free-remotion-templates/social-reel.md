# Social Reel Frame — `free-remotion-templates/social-reel`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `ui-mockups` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Вертикальный «плеер» коротких видео (9:16, 608×1080) посреди горизонтальной
сцены: аватар, хэндл, кнопка Follow, правая колонка лайк/коммент/шер,
подпись и полоса прогресса. Внутри сменяются четыре мини-сцены: слоган с
акцентным словом → вторая фраза → инфопанель → пульсирующая CTA.

## Когда использовать

Продвижение в соцсетях, «как это выглядит в ленте», анонс рилса, кейс
SMM. Для реального видео внутри плеера нужно добавить `<Video>`/`<Img>`.

## Фразы из озвучки

- «ролик, который останавливает скролл»
- «так это увидят подписчики в ленте»
- «смотрите полную версию по ссылке в профиле»

## Визуальный стиль

Тёмные градиенты `#1b1d2a → #222540 → #10243f`, синий акцент `#4f8cff`,
скругление 36, тени; системный sans-serif. В Root: 1920×1080, 150 кадров.

## Входные данные

`SocialReelProps`: `brandName` («Streamly»), `handle` («@aria.studio»),
`headline` / `headlineAccent` («Make it» / «unmissable»), `secondCopy`
(с `\n`), `infoLines: string[]` (3 строки), `ctaText`, `accentColor`,
`bgFrom` / `bgVia` / `bgTo`, `caption`, `likeCount` («12.4k»).

## Анимации

Сцены — `Sequence` на кадрах 0–48, 48–90, 90–138, 102–150 (`S(sec)` = sec/5·30).
FadeIn (opacity + translateY, `Easing.out(ease)`), AccentLine scaleX,
PulseButton (`spring` + `sin` 0.97–1.03), Ken Burns фона 1→1.08, прогресс-бар
0→100 %, «удар» сердечка `frame % 90`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/social-reel/SocialReel.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`. Тайминги сцен и прогресс привязаны к константе `DURATION_FRAMES`
(150), размеры плеера и шрифтов — в px; для 1080×1920 убрать внешнюю сцену
и растянуть `PlayerBody` на весь кадр.

## Паттерны

`sequence-steps`, `key-point-emphasis`
