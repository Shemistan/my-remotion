# Expandable (carousel) — `animata/expandable`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | complex |
| Флаги | `timers`, `user-events`, `css-transition`, `css-animation`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md); фото по умолчанию — Unsplash |

## Что визуализирует

Горизонтальная «гармошка» из вертикальных фото-полос высотой 384px:
активная полоса расширяется на всю оставшуюся ширину и становится
резкой, остальные — узкие и размытые; на активной снизу слева волной
проявляется крупный заголовок (WaveReveal). Каждые 5 с активной
становится следующая.

## Когда использовать

Смена тем/локаций/глав: «Горы → Великая стена → Текстуры», обзор
нескольких направлений с фото.

## Фразы из озвучки

- «три направления — три истории»
- «от гор до Великой стены»
- «переходим к следующей главе»

## Визуальный стиль

Фото на всю высоту, gap-1, rounded-md, blur 2px у неактивных, белый
заголовок md:text-6xl; переход ширины 300 мс.

## Входные данные

`list?: {image, title}[]` (3 Unsplash-фото по умолчанию),
`autoPlay = true`, `className?`.

## Анимации

`setInterval(5000)` переключает `activeItem` (пауза при hover),
`onMouseEnter` активирует полосу; ширина — CSS `grow` + `transition-all
duration-300`; заголовок — `WaveReveal` (CSS-анимация букв со
`animationDelay`).

## Исходники и документация

- `templates/react-libriry/animata/animata/carousel/expandable.tsx` — компонент
- `templates/react-libriry/animata/animata/text/wave-reveal.tsx` — заголовок
- `templates/react-libriry/animata/content/docs/carousel/expandable.mdx` — документация
- `templates/react-libriry/animata/animata/carousel/expandable.stories.tsx` — пример

## Зависимости

`animata/text/wave-reveal`, `@/lib/utils`.

## Совместимость и адаптация

`complex` по классу (таймер + transition), перевод прямой:
`activeItem = Math.floor(frame/(5*fps)) % n`, `flex-grow` активной —
`interpolate(frame % (5*fps), [0, 0.3*fps], [0, 1])` (у прежней — обратно),
blur так же; `WaveReveal` перемонтировать в `<Sequence>` на каждую смену
и проигрывать его CSS через отрицательный `animationDelay`. Фото — локально.

## Паттерны

`sequence-steps`, `comparison`, `transformation`
