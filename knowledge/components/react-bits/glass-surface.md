# GlassSurface — `react-bits/glass-surface`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `webgl`, `dom`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Панель «жидкого стекла» в стиле Apple: скруглённый прямоугольник (или
форма любого SVG-логотипа), который преломляет и слегка расслаивает по
цветам то, что находится за ним; внутрь кладётся свой контент.

## Когда использовать

Подложка для заголовка, плашки, кнопки-CTA, UI-панели поверх видео или
градиентного фона; «стеклянный» логотип. Своей анимации нет — двигать
саму панель или фон под ней.

## Фразы из озвучки

- «Чистый и прозрачный интерфейс»
- «Всё лишнее — за стеклом»
- «Новый дизайн, вдохновлённый стеклом»

## Визуальный стиль

Минималистичный glassmorphism: радиус 20, размытие 11, хроматический
сдвиг каналов (R 0, G 10, B 20) при `distortionScale=-180`.

## Входные данные

`children`, `width=200`, `height=80`, `borderRadius=20`, `borderWidth=0.07`,
`brightness=50`, `opacity=0.93`, `blur=11`, `displace=0`,
`backgroundOpacity=0`, `saturation=1`, `distortionScale=-180`,
`redOffset=0`, `greenOffset=10`, `blueOffset=20`, `xChannel='R'`,
`yChannel='G'`, `mixBlendMode='difference'`, `refraction=true`,
`renderer='auto'`, `backdrop` (изображение фона для WebGL-режима),
`shape` (URL SVG-логотипа), `className`, `style={}`.

## Анимации

Нет собственной анимации. Карта смещения — SVG data-URI по размеру
(`ResizeObserver`), применяется через `backdrop-filter: url(#filter)` с
`feDisplacementMap` по каналам; в Safari/Firefox — WebGL2-шейдер по
переданному `backdrop`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/GlassSurface/GlassSurface.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/GlassSurface/GlassSurface.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/GlassSurface/GlassSurface.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/GlassSurfaceDemo.jsx` — демо
- https://reactbits.dev/components/glass-surface

## Зависимости

Нет внешних пакетов.

## Совместимость и адаптация

`adaptable`: статичная картинка, детерминирована. Рендер Remotion идёт в
Chromium, где работает SVG-путь `backdrop-filter`; при смене размера
панели по кадру карта пересоздаётся (`ResizeObserver` → setState), лучше
держать размер постоянным и анимировать `transform`. `shape`/`backdrop`
грузятся асинхронно — `delayRender` до `onload`. Файл прочитан частично
(props, шейдер, генерация карты).

## Паттерны

`key-point-emphasis`
