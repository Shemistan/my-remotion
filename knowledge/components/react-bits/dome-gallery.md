# DomeGallery — `react-bits/dome-gallery`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:other`, `raf`, `dom`, `user-events`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Иммерсивный купол из фото: плитки разложены по внутренней поверхности
сферы (CSS 3D), зритель как будто внутри; по краям — затемнение цветом
`overlayBlurColor`, по клику фото раскрывается крупно.

## Когда использовать

«Целый мир контента», большая библиотека, сообщество, тысячи историй,
погружение в архив. Для плоской сетки — `react-bits/masonry`.

## Фразы из озвучки

- «Погрузитесь в целую вселенную контента»
- «Тысячи историй наших пользователей»
- «Вся библиотека — вокруг вас»

## Визуальный стиль

Тёмный фон `#120F17`, фото в оттенках серого (`grayscale=true`), радиус
плиток 30 px, 35 сегментов по кругу; кинематографично и «галерейно».

## Входные данные

`images` (строки или `{src, alt}`; по умолчанию фото Unsplash и X),
`fit=0.5`, `fitBasis='auto'` (`auto|min|max|width|height`), `minRadius=600`,
`maxRadius=Infinity`, `padFactor=0.25`, `overlayBlurColor='#120F17'`,
`maxVerticalRotationDeg=5`, `dragSensitivity=20`, `enlargeTransitionMs=300`,
`segments=35`, `dragDampening=2`, `openedImageWidth='400px'`,
`openedImageHeight='400px'`, `imageBorderRadius='30px'`,
`openedImageBorderRadius='30px'`, `grayscale=true`.

## Анимации

Сфера вращается только drag-жестом (`@use-gesture/react`) с инерцией в
rAF: `transform: translateZ(-radius) rotateX(x) rotateY(y)`; радиус от
размеров (`ResizeObserver`); раскрытие фото — CSS-переход. Автовращения
в прочитанной части кода нет.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/DomeGallery/DomeGallery.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/DomeGallery/DomeGallery.css` — 3D-раскладка
- `templates/react-libriry/react-bits/src/ts-default/Components/DomeGallery/DomeGallery.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/DomeGalleryDemo.jsx` — демо
- https://reactbits.dev/components/dome-gallery

## Зависимости

`@use-gesture/react`.

## Совместимость и адаптация

`adaptable`: картинка — чистый CSS 3D, состояние сводится к двум углам.
Рецепт: вызывать `applyTransform(x, y)` из рендера с
`y = (frame/fps) * degPerSec`, `x = sin(frame/fps*0.3) * maxVerticalRotationDeg`;
убрать `useGesture`, инерцию, раскрытие; радиус задать явно вместо
`ResizeObserver`. Картинки по умолчанию с внешних CDN — заменить на
`staticFile`. Файл прочитан частично (раскладка, props, начало эффектов).

## Паттерны

`spatial`, `quantities`
