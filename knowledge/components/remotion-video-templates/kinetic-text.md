# KineticText — `remotion-video-templates/kinetic-text`

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

Кинетическая типографика: строки сценария по очереди занимают центр экрана,
слова в строке выпрыгивают снизу со stagger; строки с `emphasis` крупнее и
цветом акцента. Каждая строка держится и гаснет.

## Когда использовать

Манифест, слоган, ключевой тезис, разбитый на короткие фразы; закадровый
текст «в лоб». Для одного слова-удара хватит акцентной строки; для
длинного текста с таймингом аудио — `captioned-short`.

## Фразы из озвучки

- «вам не нужен монтажёр — вам нужен код»
- «просто. быстро. надёжно.»
- «главное — запомните одно слово»

## Визуальный стиль

Тёмный фон `#09090B`, белый текст `#FAFAFA`, акцент `#60A5FA`, Inter 700
(104 px) / 800 (150 px для emphasis). 1920×1080, 30 fps.

## Входные данные

zod `kineticTextSchema`: `lines: {text: string, emphasis?: boolean}[]`
(1..8; по умолчанию 4 строки), `backgroundColor`, `textColor`,
`emphasisColor: zColor()`.
`layoutKinetic(lines)` — общая функция таймлайна: длительность строки =
слова×4 + 16 + 42 + 14 кадров; `kineticTextCalculateMetadata` суммирует.

## Анимации

Каждая строка в своём `Sequence`; слово — `spring(SNAPPY, delay: i*4)`:
translateY 46→0, scale 0.9→1 (emphasis 0.7→1), opacity; выход строки —
opacity за последние 14 кадров.

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/templates/KineticText/KineticText.tsx`
- `templates/remotion-components/remotion-video-templates/README.md` — раздел про `calculateMetadata`

## Зависимости

`remotion` (`Sequence`, `spring`, `interpolate`), `zod`,
`@remotion/zod-types`, `lib/springs`, `lib/fonts` (Inter).

## Совместимость и адаптация

`native`. Тайминг строк не привязан к аудио: для синхронизации с озвучкой
задать свои `from`/длительности или перейти на `captioned-short`.

## Паттерны

`key-point-emphasis`, `sequence-steps`
