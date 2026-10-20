# LowerThirds (демо трёх стилей) — `remotion-video-templates/lower-thirds`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-video-templates` (`templates/remotion-components/remotion-video-templates`) |
| Вид | template |
| Категория | `layout-templates` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Демо-композиция: подряд (`Series`) проигрываются три плашки «имя + роль» в
левом нижнем углу — `SlideInBar`, `BoxedFade`, `MinimalLine` — на светлом
градиентном фоне с бледной надписью «Lower Thirds».

## Когда использовать

Как витрина/референс трёх стилей титра. В реальном монтаже брать отдельный
стиль (`lower-third-slide-in-bar`, `lower-third-boxed-fade`,
`lower-third-minimal-line`) поверх своего видео, а фон-сцену убрать.

## Фразы из озвучки

- «с нами сегодня руководитель продукта»
- «меня зовут Алекс, я разработчик»
- «слово эксперту»

## Визуальный стиль

Светлый, корпоративный, шрифт Inter (`@remotion/google-fonts`), акцент
`#2563EB`, белые карточки с тенью. 1920×1080, 30 fps; длительность считается.

## Входные данные

zod `lowerThirdsSchema`: `name: string` («Alejandro Brito»), `role: string`
(«Full-stack + AI Developer»), `accentColor: zColor()` (`#2563EB`),
`enterDurationInFrames` int 4..60 (14), `holdDurationInFrames` int 10..240
(70), `exitDurationInFrames` int 4..60 (14).
`lowerThirdsCalculateMetadata`: `durationInFrames = 3 × (enter+hold+exit)`
(по умолчанию 294).

## Анимации

Общий хук `useEnvelope` в `styles.tsx`: вход — `spring(SNAPPY,
durationInFrames: enter)`, выход — линейный `interpolate` после hold,
opacity = enter × (1 − exit). Подробности — в карточках стилей.

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/templates/LowerThirds/LowerThirds.tsx`
- `templates/remotion-components/remotion-video-templates/src/templates/LowerThirds/styles.tsx`
- `templates/remotion-components/remotion-video-templates/README.md`

## Зависимости

`remotion` (`Series`, `CalculateMetadataFunction`), `zod`,
`@remotion/zod-types`, `@remotion/google-fonts/Inter`; `lib/colors`,
`lib/fonts`, `lib/layout`, `lib/springs`.

## Совместимость и адаптация

`native`. Для наложения на видео убрать `StageBackground` и оставить один
стиль в `Sequence` нужной длины.

## Паттерны

`key-point-emphasis`
