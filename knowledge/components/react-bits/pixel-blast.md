# PixelBlast — `react-bits/pixel-blast`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Поле пикселей (квадраты и др. `variant`), складывающихся в дрейфующий
шумовой узор с мерцанием и мягким свечением; клики пускают кольца,
hover «проявляет» узор.

## Когда использовать

Пиксель-арт, цифровая трансформация, «оцифровка», игровой/тех фон.

## Фразы из озвучки

- «всё становится цифровым»
- «пиксель за пикселем мы строим будущее»
- «данные оживают»

## Визуальный стиль

Сиреневые пиксели (`#B497CF`), размер 3, растушёвка краёв 0.25.

## Входные данные

Из usage: `variant = 'square'`, `pixelSize = 3`, `color = '#B497CF'`,
`patternScale = 2`, `patternDensity = 1`, `softness = 0.6`, `glow = 0.4`,
`twinkle = 0.25`, `drift = 0.2`, `hoverEffect = 'reveal'`,
`enableRipples`, `edgeFade = 0.25`. До 10 кликов (`MAX_CLICKS`).

## Анимации

WebGL2-шейдер, дрейф и мерцание по времени (rAF), кольца от кликов.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/PixelBlast/PixelBlast.jsx` (+ `PixelBlast.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/PixelBlast/PixelBlast.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/PixelBlastDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; кольца задавать списком кадров/точек вместо кликов.

## Паттерны

`transformation`, `abstract-concepts`
