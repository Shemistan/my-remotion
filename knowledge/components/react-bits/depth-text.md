# DepthText — `react-bits/depth-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Объёмная «выдавленная» надпись из десятков слоёв в CSS-3D (`translateZ`),
которая медленно покачивается по орбите (или наклоняется за курсором);
интро — глубина «вырастает» из плоскости; варианты: градиентное затухание
глубины, контурные слои, лёгкое парение.

## Когда использовать

Крупный акцентный заголовок, название продукта, «выходим на новый уровень»,
постерный 3D-эффект без WebGL. Для плоского входа — `react-bits/split-text`.

## Фразы из озвучки

- «Поднимаем продукт на новый уровень»
- «Глубина, которую чувствуешь»
- «Это больше, чем просто слово»

## Визуальный стиль

Чёрный 900, глубина фиолетовая `#7c3aed`, 34 слоя по 2.4px, тень; «игрушечно»
объёмно, спокойная орбита (0.35 оборота/с).

## Входные данные

`text='Elevate'`, `layers=34` (2–64), `depth=2.4`, `faceColor='currentColor'`,
`depthColor='#7c3aed'`, `gradientDepth=false`, `tilt=7.5`, `pointerTracking=true`,
`smoothing=0.14`, `perspective=900`, `autoOrbit=true`, `orbitSpeed=0.35`,
`hoverPush=0`, `float=false`, `fontSize='clamp(3rem, 12vw, 7rem)'`,
`fontWeight=900`, `shadow=true`, `outline=false`, `intro=true`, `className`, `style`.

## Анимации

rAF: интро `--depth-text-grow` по easeOutCubic за 1,2 с; цель орбиты —
`sin/cos(elapsed * orbitSpeed * 2π)` × tilt, текущий угол подтягивается
`smoothing`; hover-«вдавливание» — пружина; `float` — синусоиды от времени.
Слои — статичные спаны с `translateZ`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/DepthText/DepthText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/DepthText/DepthText.css` — 3D-стек слоёв
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/DepthText/DepthText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/DepthTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/depth-text

## Зависимости

Нет внешних пакетов (React + CSS 3D).

## Совместимость и адаптация

`adaptable` при `pointerTracking=false`, `hoverPush=0`: поворот и рост —
функции времени. Рецепт: `t = frame/fps`; `grow = 1 - (1 - min(1, t/1.2))^3`
в `--depth-text-grow`; `rotateX = base.x + sin(t*orbitSpeed*2π)*tilt*0.55`,
`rotateY = base.y + cos(t*orbitSpeed*2π*0.85)*tilt*0.55` сразу в transform
сцены (без сглаживания `smoothing` — оно лишь накапливает отставание);
`float` — те же синусоиды от `t`. rAF и обработчики указателя убрать.

## Паттерны

`key-point-emphasis`, `spatial`
