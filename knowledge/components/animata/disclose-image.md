# DiscloseImage — `animata/disclose-image`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Изображение, закрытое двумя цветными «створками» (sky-500), которые
разъезжаются влево/вправо (или вверх/вниз) после загрузки картинки —
эффект открывающихся дверей.

## Когда использовать

Эффектное «открытие» фото/скриншота/продукта: «а вот и результат»,
«представляем». Для фото, вырастающего из заголовка, — `animata/aperture-reveal`.

## Фразы из озвучки

- «и вот что получилось»
- «встречайте новинку»
- «приоткроем завесу»

## Визуальный стиль

Карточка 208×256 (h-64 w-52), rounded-md, плоские створки sky-500
(переопределяются `doorClassName`), медленный easing `ease-slow`,
длительность `duration-mid` (3 с).

## Входные данные

`ImgHTMLAttributes<HTMLImageElement>` (src, alt…) + `doorClassName?`,
`vertical = false`, `className?` (для img).

## Анимации

После `onLoad` створки монтируются с tw-animate-css `animate-out
slide-out-to-left-full / -right-full` (или `-top/-bottom` при `vertical`),
`fill-mode-forwards`; easing/длительность — токены `--ease-slow`,
`--transition-duration-mid` из `styles/globals.css`.

## Исходники и документация

- `templates/react-libriry/animata/animata/image/disclose-image.tsx` — компонент
- `templates/react-libriry/animata/content/docs/image/disclose-image.mdx` — документация
- `templates/react-libriry/animata/animata/image/disclose-image.stories.tsx` — пример

## Зависимости

`tw-animate-css`, Tailwind-токены сайта, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: заменить `onLoad`-гейт на `<Img>` из remotion (сам ждёт
загрузку) и рисовать створки всегда; `translateX(∓p*100%)` с
`p = interpolate(frame, [start, start+3*fps], [0,1], {easing:
Easing.bezier(0.405,0,0.025,1)})`.

## Паттерны

`key-point-emphasis`, `transformation`
