# SlideInBar — `remotion-video-templates/lower-third-slide-in-bar`

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

Титр «имя + роль»: белая карточка со скруглением и вертикальной цветной
полосой слева въезжает слева, держится и уезжает влево с затуханием.

## Когда использовать

Подпись говорящего, гостя интервью, автора цитаты — самый «плотный» и
заметный из трёх стилей. Для светлого «воздушного» кадра — `lower-third-minimal-line`.

## Фразы из озвучки

- «рассказывает ведущий инженер команды»
- «с нами на связи основатель стартапа»
- «комментирует аналитик»

## Визуальный стиль

Белая карточка, полоса 12 px цвета `accentColor`, тень, Inter 700/52 px
(имя) и 500/30 px (роль), цвета `palette.ink`/`zinc500`. Позиция — safe area
5 % снизу-слева.

## Входные данные

`LowerThirdStyleProps`: `name: string`, `role: string`, `accentColor: string`,
`enterDurationInFrames`, `holdDurationInFrames`, `exitDurationInFrames:
number`. Длина клипа — `lowerThirdTotalFrames(p)` = enter+hold+exit.

## Анимации

`useEnvelope`: `spring(SNAPPY, durationInFrames: enter)`; translateX
−90→0 на входе и 0→−60 на выходе; opacity enter×(1−exit).

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/templates/LowerThirds/styles.tsx` — `SlideInBar`
- `templates/remotion-components/remotion-video-templates/src/lib/layout.tsx` — `SafeArea`

## Зависимости

`remotion`, `@remotion/google-fonts/Inter` (через `lib/fonts`),
`lib/colors`, `lib/springs`, `lib/layout`.

## Совместимость и адаптация

`native`. Размеры шрифтов в px под 1080p — для других разрешений
масштабировать. Размещать в `Sequence` длиной `lowerThirdTotalFrames`.

## Паттерны

`key-point-emphasis`
