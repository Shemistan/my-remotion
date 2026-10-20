# MinimalLine — `remotion-video-templates/lower-third-minimal-line`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-video-templates` (`templates/remotion-components/remotion-video-templates`) |
| Вид | component |
| Категория | `layout-templates` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Минималистичный титр без карточки: тонкая цветная линия вытягивается слева
направо, под ней всплывают имя (крупнее) и роль.

## Когда использовать

Спокойные интервью, документальный стиль, когда плашка мешает кадру.
Для контрастного фона/шумной картинки лучше `lower-third-slide-in-bar`.

## Фразы из озвучки

- «историю рассказывает её автор»
- «наш гость — исследователь из университета»
- «вот что говорит практик»

## Визуальный стиль

Линия 340×4 px цвета `accentColor`, Inter 700/58 px имя, 500/30 px роль,
без фона. Safe area снизу-слева.

## Входные данные

`LowerThirdStyleProps`: `name`, `role`, `accentColor: string`;
`enterDurationInFrames`, `holdDurationInFrames`, `exitDurationInFrames: number`.

## Анимации

`useEnvelope`: линия `scaleX` 0→1 (`transformOrigin: left`), текст
translateY 22→0, общая opacity enter×(1−exit).

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/templates/LowerThirds/styles.tsx` — `MinimalLine`

## Зависимости

`remotion`, `lib/colors`, `lib/fonts`, `lib/springs`, `lib/layout`.

## Совместимость и адаптация

`native`. Цвет текста `palette.ink` (тёмный) — для тёмного видео задать
светлый цвет.

## Паттерны

`key-point-emphasis`
