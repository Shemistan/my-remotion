# BoxedFade — `remotion-video-templates/lower-third-boxed-fade`

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

Титр «имя + роль» в полупрозрачной тонированной рамке с толстой левой
линией акцентного цвета; проявляется с лёгким увеличением 0.92→1 от
левого нижнего угла и гаснет.

## Когда использовать

Подпись спикера, когда нужен «мягкий» брендированный вид без белой
плашки; роль подсвечивается цветом бренда. Для более заметного въезда —
`lower-third-slide-in-bar`.

## Фразы из озвучки

- «на вопросы отвечает директор по продукту»
- «эксперт по безопасности поясняет»
- «говорит участник проекта»

## Визуальный стиль

Фон `accentColor` с альфой 0.1, рамка альфа 0.35, левая граница 6 px,
скругление 16, `backdropFilter: blur(2px)`; Inter, роль цветом акцента 600.

## Входные данные

`LowerThirdStyleProps`: `name`, `role`, `accentColor: string`;
`enterDurationInFrames`, `holdDurationInFrames`, `exitDurationInFrames: number`.

## Анимации

`useEnvelope` (`spring(SNAPPY)` вход, линейный выход); scale
`interpolate(enter, [0,1], [0.92,1])`, `transformOrigin: left bottom`;
opacity enter×(1−exit).

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/templates/LowerThirds/styles.tsx` — `BoxedFade`

## Зависимости

`remotion`, `lib/colors` (`withAlpha`), `lib/fonts` (Inter), `lib/springs`,
`lib/layout`.

## Совместимость и адаптация

`native`. `backdropFilter` заметен только поверх видео/картинки.

## Паттерны

`key-point-emphasis`
