# Noise — `react-bits/noise`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `dom` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Оверлей киноплёнки: зерно (моно или цветное), опционально пыль, царапины,
строки развёртки и мерцание, с режимом смешивания поверх картинки/видео.

## Когда использовать

Ретро, архив, «документальная» подача, кинематографичность поверх фото
и видео. Не брать на мелкий текст.

## Фразы из озвучки

- «как на старой плёнке»
- «вернёмся в прошлое»
- «архивные кадры»

## Визуальный стиль

Зерно 256×256 тайлами, `blendMode = 'overlay'`, прозрачность 0.2,
частота 24 fps.

## Входные данные

Из usage: `opacity = 0.2`, `size = 1`, `fps = 24`, `blendMode = 'overlay'`
(`normal|overlay|soft-light|multiply|screen|difference`), `contrast = 0.6`,
`colored = false`, `dust = 0`, `scratches = 0`, `scanlines = 0`,
`flicker = 0`.

## Анимации

Тайл шума рисуется в Canvas 2D детерминированным генератором
(`generator(1013904223)`), затем кадры шума сменяются с частотой `fps`
(механизм смены — цикл анимации компонента; построчно не сверен).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/Noise/Noise.jsx` (+ `Noise.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/Noise/Noise.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/NoiseDemo.jsx`

## Зависимости

`react`; Canvas 2D.

## Совместимость и адаптация

`complex`: рецепт R3 — номер кадра шума `floor(frame / fps_video * fps)`
определяет сдвиг/вариант тайла; генератор уже детерминирован (плюс). Для
Remotion есть и нативные альтернативы (`@remotion/noise`).

## Паттерны

`timeline`, `abstract-concepts`
