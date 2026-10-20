# Iridescence — `react-bits/iridescence`

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

Переливающаяся перламутровая плёнка: закрученные разводы цвета, как масло
на воде или мыльный пузырь, с бликом и зерном.

## Когда использовать

Мягкий «волшебный» фон: креатив, косметика, AI-генерация, трансформация.

## Фразы из озвучки

- «каждый раз результат немного другой»
- «магия в деталях»
- «идея начинает переливаться новыми красками»

## Визуальный стиль

Голубоватый перламутр (`color = '#8099cc'`), регулируемые оттенок,
насыщенность, контраст; плавное течение.

## Входные данные

Из usage: `color = '#8099cc'`, `hueShift = 0`, `saturation = 1`,
`brightness = 1.5`, `contrast = 1`, `speed = 1`, `scale = 1`, `detail = 8`,
`warp = 1`, `rotation = 0`, `mouseReact = true`, `amplitude = 0.1`,
`stir = 0.5`, `sheen = 0.3`, `clickSwirl = true`, `grain = 0`, `fade = 0`.

## Анимации

Сырой WebGL2 (fullscreen-треугольник), время в rAF; курсор «размешивает»,
клик закручивает.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Iridescence/Iridescence.jsx` (+ `Iridescence.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Iridescence/Iridescence.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/IridescenceDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1, `mouseReact={false}`, `clickSwirl={false}`.

## Паттерны

`transformation`, `abstract-concepts`
