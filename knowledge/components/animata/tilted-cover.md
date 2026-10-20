# TiltedCover — `animata/tilted-cover`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Две карточки 160×208 в 3D-перспективе: задняя («контент») повёрнута на
20° по Y и уменьшена, передняя «обложка» в белой рамке 6px тоже наклонена.
По наведению обложка улетает в сторону и гаснет, а контент выпрямляется.

## Когда использовать

«Заглянем под обложку», раскрытие книги/кейса/продукта: обложка → суть.
Для открытия створками — `animata/disclose-image`.

## Фразы из озвучки

- «за красивой обложкой — серьёзная работа»
- «заглянем внутрь»
- «откроем кейс»

## Визуальный стиль

Перспектива 400px, наклон 20°, rounded-xl, мягкий easing `ease-slow`
500 мс; журнально-аккуратно.

## Входные данные

`direction: "left" | "right" = "left"`, `cover?: ReactNode`,
`tiltCover = true`, `children?` (задний контент),
`image?: ComponentPropsWithoutRef<"img">` (приоритет над `cover`).

## Анимации

CSS `transition-all duration-500 ease-slow` по `group-hover/tilt`:
`transform-none!`, обложка `left: ±200%` + `opacity-0` (delay 75 мс).

## Исходники и документация

- `templates/react-libriry/animata/animata/image/tilted-cover.tsx` — компонент
- `templates/react-libriry/animata/content/docs/image/tilted-cover.mdx` — документация
- `templates/react-libriry/animata/animata/image/tilted-cover.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`), токен `--ease-slow` из `styles/globals.css`.

## Совместимость и адаптация

`adaptable`: исходное (наклонённое) состояние статично. «Раскрытие» —
прогресс `p` из кадра: `rotateY(${factor*20*(1-p)}deg) scale(${0.85+0.15*p})`
для фона, `left: ${±200*p}%`, `opacity: 1-p` для обложки; убрать
`group-hover` и `transition`.

## Паттерны

`transformation`, `key-point-emphasis`
