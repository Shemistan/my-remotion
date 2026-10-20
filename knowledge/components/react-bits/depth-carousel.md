# DepthCarousel — `react-bits/depth-carousel`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `timers`, `dom`, `user-events`, `external-service`, `svg` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Карусель карточек-изображений, уходящих в глубину по 3D-рельсу: активная
спереди, следующие сдвинуты вбок, отодвинуты по Z, повёрнуты и затемнены с
размытием; переход к следующей — плавный «наезд».

## Когда использовать

Пошаговый показ продуктов, кейсов, слайдов; «далее — следующий пример»;
ощущение очереди/глубины. Для кольца в 3D — `react-bits/circular-carousel`.

## Фразы из озвучки

- «Переходим к следующему кейсу»
- «Вот что ждёт вас дальше»
- «Шаг за шагом — к результату»

## Визуальный стиль

Карточки 300×380, радиус 18px, тонировка `#05060a`, глубина 220px, сдвиг
90px, наклон 22°, перспектива 1400; кинематографичный, тёмный.

## Входные данные

`items` (строки или `{image, alt}`; по умолчанию picsum.photos),
`cardWidth=300`, `cardHeight=380`, `radius=18`, `tint='#05060a'`, `depth=220`,
`spread=90`, `tilt=22`, `tiltDirection='right'`, `perspective=1400`,
`visibleCards=4`, `falloff=0.2`, `blur=6`, `duration=700` (мс),
`ease='power3.out'`, `autoplay=false`, `autoplayDelay=3200`, `loop=true`,
`showControls=true`, `showIndicators=true`, `onChange`, `className`.

## Анимации

`layout(pos)` — чистая функция дробной позиции: для `d = i - pos`
`translateX = spread*d`, `translateZ = -depth*d`, `rotateY = tilt*clamp(d,0,1)`,
`brightness`, `blur`, `opacity`. Переход — `gsap.to(proxy, {p: target, duration, ease})`;
автоплей — `setInterval(navigateBy(1))`; wheel/drag/клавиатура.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/DepthCarousel/DepthCarousel.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/DepthCarousel/DepthCarousel.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/DepthCarousel/DepthCarousel.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/DepthCarouselDemo.jsx` — демо
- https://reactbits.dev/components/depth-carousel

## Зависимости

`gsap`.

## Совместимость и адаптация

`adaptable`: вся картинка — `layout(pos)`. Рецепт: `step = autoplayDelay/1000*fps`,
`k = floor(frame/step)`, `pos = k + Easing.out(Easing.cubic)(clamp((frame % step)/(duration/1000*fps)))`
и применять стили в рендере. GSAP, `setInterval`, `ResizeObserver`
(масштаб — из размеров композиции), wheel/drag убрать; стрелки и точки
скрыть (`showControls=false`, `showIndicators=false`) или анимировать
активную точку. Изображения — локальные через `staticFile`.

## Паттерны

`sequence-steps`, `spatial`
