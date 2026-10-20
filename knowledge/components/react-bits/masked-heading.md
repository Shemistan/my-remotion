# MaskedHeading — `react-bits/masked-heading`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `raf`, `dom`, `svg`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Крупный заголовок, буквы которого — окна в картинку или видео (SVG
`clipPath` из глифов): изображение медленно дрейфует внутри букв, текст
появляется по словам (`rise`), побуквенно (`scale`), через фокус (`blur`),
шторкой (`wipe`) или fade; опционально тонировка, «прожектор», возвращающий
цвет, и тонкий контур букв.

## Когда использовать

Обложка/тайтл с фото места или продукта, «за словами — реальные люди»,
travel, премиальное интро. Без картинки — `react-bits/gradient-text`.

## Фразы из озвучки

- «За каждым словом — реальная история»
- «Добро пожаловать в Исландию»
- «Продуманно до мелочей»

## Визуальный стиль

Заголовок `h2`/700, размер от ширины (`textScale=0.115`), трекинг -0.03em;
изображение увеличено ×1.25 и плавает на 18px — «журнальная обложка».

## Входные данные

`text='Designed in the details'`, `tag='h2'`, `mediaType='image'` (`image|video`),
`src=''`, `poster=''`, `fillScale=1.25`, `parallax=26`, `drift=18`, `hoverZoom=0`,
`brightness=1`, `saturation=1`, `grayscale=false`, `tint=''`, `spotlight=false`,
`spotlightRadius=160`, `outline=false`, `outlineColor=''`, `outlineWidth=1`,
`reveal='rise'` (`rise|scale|blur|wipe|fade|none`), `duration=1.1`,
`stagger=0.09`, `trigger='view'` (`view|hover|mount`), `align='center'`,
`weight=700`, `tracking=-0.03`, `lineHeight=1.06`, `textScale=0.115`,
`className`, `style`, `...rest`.

## Анимации

Позиции глифов измеряются через `Range.getBoundingClientRect` и пишутся в
`<text>` клипа; GSAP-твины меняют состояния глифов `{x, y, s}` и
`renderGlyphs` ставит `transform`, wipe — `clip-path inset`, blur — фильтр
слоя. rAF: дрейф медиа `sin/cos(clock)*drift` (со сглаживанием), авто-ход
прожектора, parallax за курсором.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/MaskedHeading/MaskedHeading.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/MaskedHeading/MaskedHeading.css` — слои маски
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/MaskedHeading/MaskedHeading.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/MaskedHeadingDemo.jsx` — демо
- https://reactbits.dev/text-animations/masked-heading

## Зависимости

`gsap`.
## Совместимость и адаптация

`adaptable`: разметка (clipPath из глифов + медиа) остаётся. Рецепт:
измерить глифы один раз после шрифта (`delayRender`); для `rise`
`y_i = em*1.15*(1 - ease(clamp((t - word_i*stagger)/duration)))`,
`ease = Easing.out(Easing.poly(5))` (аналог `power4.out`), `scale` — `s_i` по букве, `wipe` — `inset(0 p% 0 0)`;
дрейф медиа — `translate(sin(t*0.21)*drift, cos(t*0.17)*drift*0.6)` без
сглаживания; `t = frame/fps`. `<img>` → `Img` + `staticFile`, `<video>` →
`OffthreadVideo`/`Video` из remotion. IntersectionObserver, hover, parallax убрать.

## Паттерны

`key-point-emphasis`, `spatial`
