# PixelSnow — `react-bits/pixel-snow`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Пиксельный снегопад: снежинки-спрайты (квадраты, снежинки и др.) падают
с ветром и свечением; курсор их расталкивает.

## Когда использовать

Зима, праздники, «новый сезон», спокойная атмосфера, ретро-игры.

## Фразы из озвучки

- «пришла зима»
- «с наступающим новым годом»
- «тишина перед большим стартом»

## Визуальный стиль

Белые пиксельные снежинки (`#ffffff`), пиксель 3, glow 0.8.

## Входные данные

Из usage: `color = '#ffffff'`, `variant = 'snowflake'`, `density = 0.5`,
`speed = 1`, `wind = 0.25`, `flakeSize = 1`, `pixelSize = 3`, `glow = 0.8`,
`mouseInteraction = true`. Спрайты — в константе `SPRITES`.

## Анимации

GPU-рендер (импортов библиотек нет), падение по времени (rAF).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/PixelSnow/PixelSnow.jsx` (+ `PixelSnow.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/PixelSnow/PixelSnow.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/PixelSnowDemo.jsx`

## Зависимости

`react`

## Совместимость и адаптация

`complex`: рецепт R1 (если снежинки — частицы с накопленными позициями,
считать позицию как функцию времени: `y = (y0 + speed * t) mod H`).

## Паттерны

`abstract-concepts`, `timeline`
