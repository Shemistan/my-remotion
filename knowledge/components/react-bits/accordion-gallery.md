# AccordionGallery — `react-bits/accordion-gallery`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `dom`, `user-events`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Ряд (или колонка) узких панелей-фотографий; активная раскрывается на
большую часть ширины, становится цветной и показывает подпись с акцентной
чертой, остальные сжаты, ч/б, слегка повёрнуты в 3D и смещены параллаксом.

## Когда использовать

Перебор направлений/городов/продуктов, «пять направлений нашей работы»,
поочерёдное раскрытие разделов. Автоплея нет — активную панель задаёт сценарий.

## Фразы из озвучки

- «Пять направлений, в которых мы работаем»
- «Сначала горы, потом побережье, потом город»
- «Раскроем каждый раздел по очереди»

## Визуальный стиль

Высота 460px, gap 10, радиус 16, затемнение `#060010`, белый акцент,
ч/б неактивные панели; журнальный, тревел-стиль.

## Входные данные

`items` (`{image, label, link, alt}`; по умолчанию picsum.photos),
`defaultIndex=2`, `accentColor='#ffffff'`, `overlayColor='#060010'`,
`textColor='#ffffff'`, `height=460`, `gap=10`, `radius=16`,
`expandRatio=0.52`, `orientation='horizontal'` (`horizontal|vertical`),
`duration=0.6`, `ease='power3.out'`, `parallax=0.5`, `tilt=8`,
`stagger=0.06`, `trigger='hover'` (`hover` / иначе — по клику),
`showLabels=true`, `grayscale=true`, `className`.

## Анимации

При смене `active` — `gsap.timeline()`: `flexGrow` активной панели
`r*(n-1)/(1-r)`, у остальных 1; `rotateY ±tilt`; сдвиг медиа на
`drift*parallax*size*0.06`; CSS-переменные `--ag-gray/--ag-dim`; подпись и
черта — opacity/x со stagger.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/AccordionGallery/AccordionGallery.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/AccordionGallery/AccordionGallery.css` — стили панелей
- `templates/react-libriry/react-bits/src/ts-default/Components/AccordionGallery/AccordionGallery.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/AccordionGalleryDemo.jsx` — демо
- https://reactbits.dev/components/accordion-gallery

## Зависимости

`gsap`.

## Совместимость и адаптация

`adaptable`: состояния панели детерминированы индексом. Рецепт: `active`
выбирать по кадру (`floor(frame/holdFrames) % n` или по таймкодам озвучки),
`p = interpolate(frame - switchFrame, [0, duration*fps], [0, 1], {easing: Easing.out(Easing.cubic)})`
и интерполировать `flexGrow`, `rotateY`, `x`, `--ag-gray`, `--ag-dim`,
opacity подписи между старым и новым активным. GSAP-timeline, hover и
`ResizeObserver` убрать (размер медиа считать из ширины композиции).

## Паттерны

`comparison`, `sequence-steps`
