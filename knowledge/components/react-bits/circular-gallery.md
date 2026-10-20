# CircularGallery — `react-bits/circular-gallery`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `timers`, `dom`, `user-events`, `async-data`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Горизонтальная лента карточек-изображений, изогнутая дугой (`bend`), с
лёгкой волной поверхности, подписями под карточками, тенями и затуханием
краёв; карточку можно раскрыть на полный размер.

## Когда использовать

Галерея фото/работ, «наши проекты по кругу», мягкая автопрокрутка
изображений за ведущим или заголовком.

## Фразы из озвучки

- «Наши путешествия в одном кадре»
- «Двенадцать историй — двенадцать снимков»
- «Пролистаем портфолио»

## Визуальный стиль

Дуга `bend=3`, скругление 0.05, подписи `bold 30px Figtree` белым,
тень 0.25, затухание краёв 0.12; лёгкий, «галерейный».

## Входные данные

`items` (`{image, text}`; по умолчанию 12 фото picsum.photos), `bend=3`,
`textColor='#ffffff'`, `borderRadius=0.05`, `font='bold 30px Figtree'`,
`fontUrl`, `scrollSpeed=2`, `scrollEase=0.05`, `itemSize=1`,
`itemAspect=0.78`, `gap=0.26`, `wave=1`, `fadeEdges=0.12`, `shadow=0.25`,
`grayscale=false`, `showTitles=true`, `snap=true`, `autoScroll=0`,
`openOnClick=true`, `intro=true`, `onItemClick`, `onActiveChange`, `dpr`,
`className`, `style`, `...rest`.

## Анимации

Чистый WebGL2: вершинный шейдер ставит карточку на дугу по `uAngle`,
волнит `uWave*sin(… + uWaveTime)`; rAF ведёт `scroll` к `target`
(wheel/drag/клавиши/`autoScroll`), интро 1,4 с, появление текстур 0,45 с;
подписи — DOM-слой поверх. Шрифт Figtree подгружается с Google Fonts.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/CircularGallery/CircularGallery.jsx` — компонент и шейдеры
- `templates/react-libriry/react-bits/src/content/Components/CircularGallery/CircularGallery.css` — подписи, подпись-открытие
- `templates/react-libriry/react-bits/src/ts-default/Components/CircularGallery/CircularGallery.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/CircularGalleryDemo.jsx` — демо
- https://reactbits.dev/components/circular-gallery

## Зависимости

Нет npm-пакетов: WebGL2 + DOM-подписи; шрифт с fonts.googleapis.com.

## Совместимость и адаптация

`complex`: собственный WebGL-цикл со сглаживанием. Рецепт: `scroll =
autoScroll * spacing * 0.25 * frame/fps` (формула из цикла кадра),
`waveTime = 2.4 * frame/fps`, `intro = min(1, frame/fps/1.4)`, вызывать
`layout()` + `draw()` в эффекте на каждый кадр; текстуры и шрифт — под
`delayRender` (шрифт — `@remotion/google-fonts`), картинки — `staticFile`.
Wheel/drag/клавиатуру/раскрытие убрать.

## Паттерны

`sequence-steps`, `spatial`
