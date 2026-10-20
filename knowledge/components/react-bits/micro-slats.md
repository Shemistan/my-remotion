# MicroSlats — `react-bits/micro-slats`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `engine:other`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Поле мелких скруглённых «ламелей» (как жалюзи/LED-панель), по которому
прокатывается волна: ламели наклоняются и ловят блик (`glintColor`).

## Когда использовать

Технологичный фон для hardware, дисплеев, «умных» поверхностей, звука
(эквалайзер-подобное движение). Пресеты волны (`preset = 'swell'` и др.).

## Фразы из озвучки

- «миллионы пикселей работают как одно целое»
- «волна изменений прошла по всей системе»
- «каждая деталь реагирует мгновенно»

## Визуальный стиль

Фиолетовые ламели (`#A855F7`) на чёрном с белыми бликами; геометрично.

## Входные данные

Из usage-примера: `preset = 'swell'`, `color = '#A855F7'`,
`glintColor = '#ffffff'`, `backgroundColor = '#000000'`, `slatWidth = 10`,
`slatHeight = 25`, `gap = 3`, `roundness = 0.75`, `interactive`,
`cursorStrength = 1`, `cursorSize = 40`, `swirl = 0`, `trail = 1.4`,
`lean = 0`, `intro`. Полный список и дефолты — PropTable демо.

## Анимации

OGL-шейдер (`Renderer`, `Program`, `Mesh`, `RenderTarget` — след курсора в
буфере), время в rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/MicroSlats/MicroSlats.jsx` (+ `MicroSlats.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/MicroSlats/MicroSlats.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/MicroSlatsDemo.jsx`

## Зависимости

`ogl`

## Совместимость и адаптация

`complex`: рецепт R1 (OGL), `interactive={false}` — след курсора хранится
в render target и накапливается, без указателя остаётся только волна.

## Паттерны

`abstract-concepts`, `transformation`
