# DitherVeil — `react-bits/dither-veil`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `engine:other`, `raf`, `dom`, `user-events`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Фото, переведённое в дизеринг (Bayer, blue noise, Atkinson,
Floyd–Steinberg, линии; дуотон или RGB), под которым в круге проявляется
оригинал; `wander` водит круг сам.

## Когда использовать

1-bit/ретро-подача фото, «оцифровка», раскрытие картинки. Родственник
`react-bits/halftone-reveal` с другим растром.

## Фразы из озвучки

- «за пикселями скрывается реальная история»
- «как на экране первых компьютеров»
- «проявим картинку»

## Визуальный стиль

Чернила `#120f17` на бумаге `#f4f1ea`, пиксель 2, ободок `#a78bfa`.

## Входные данные

Из демо: `src`, `fit = 'contain'`, `inkColor = '#120f17'`,
`paperColor = '#f4f1ea'`, `rimColor = '#a78bfa'`, `pattern = 'floyd'`
(`bayer|noise|atkinson|floyd|lines`), `palette = 'duotone'` (`rgb`),
`pixelSize = 2`, `levels = 2`, `contrast = 1.15`, `brightness = 0`,
`revealRadius = 200`, `softness = 0.6`, `linger = 1`, `rim = 0`,
`reverse = false`, `wander = false`, `clickBurst = true`.

## Анимации

OGL-шейдер, круг проявления за курсором/`wander`, затухание `linger`, rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/DitherVeil/DitherVeil.jsx` (+ `DitherVeil.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/DitherVeil/DitherVeil.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/DitherVeilDemo.jsx`

## Зависимости

`ogl`

## Совместимость и адаптация

`complex`: рецепт R1 (OGL); `src` через `staticFile` + `delayRender`;
траектория круга от кадра или `wander`; `linger` — R3.

## Паттерны

`comparison`, `transformation`
