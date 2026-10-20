# CardSwap — `react-bits/card-swap`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `timers`, `dom`, `user-events`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Стопка карточек в перспективе, уходящая вглубь по диагонали (со skew):
по таймеру передняя карточка улетает вниз и встаёт в конец колоды,
остальные пружинисто подтягиваются вперёд; задние слегка затемнены.

## Когда использовать

Смена кейсов, отзывов, фич по очереди с ощущением «колоды»; «следующий
пример», «ещё одна история». Для плоской ленты — `react-bits/carousel`.

## Фразы из озвучки

- «И это лишь один из наших кейсов»
- «Перейдём к следующему примеру»
- «Каждую неделю — новая история клиента»

## Визуальный стиль

Карточки 460×340, радиус 18, тёмная плитка с фото и подписью-иконкой;
сдвиг 60/70 px и глубина 90 на карту, наклон 6°; упругие пружины (`bounce=0.35`).

## Входные данные

`items` (`{title, image, alt, icon}`; по умолчанию 4 фото Unsplash) или
`children` (`<Card>`), `width=460`, `height=340`, `cardDistance=60`,
`verticalDistance=70`, `depth=90`, `skewAmount=6`, `visibleCards=4`,
`delay=4000`, `autoplay=true`, `pauseOnHover=true`, `draggable=true`,
`speed=1`, `bounce=0.35`, `parallax=0.5`, `hoverSpread=0.12`, `dim=0.5`,
`cardRadius=18`, `intro=true`, `theme='dark'`, `onCardClick`, `onChange`,
`className`; ref-методы `next/prev`.

## Анимации

Позиция карты в колоде → `slot(q) = {x: q*dx, y: -q*dy, z: -q*dz}` (чистая
функция); rAF интегрирует пружины по 5 осям, фазы `exit/enter/rest`;
`setTimeout(delay)` вызывает сдвиг; intro — каскад с задержкой 70 мс на
карту и WAAPI-fade сцены.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/CardSwap/CardSwap.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/CardSwap/CardSwap.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/CardSwap/CardSwap.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/CardSwapDemo.jsx` — демо
- https://reactbits.dev/components/card-swap

## Зависимости

`@hugeicons/react`, `@hugeicons/core-free-icons` (данные по умолчанию).

## Совместимость и адаптация

`adaptable` в режиме autoplay. Рецепт: `step = delay/1000*fps`,
`k = floor(frame/step)`, `local = frame % step`; позиция карты `i` в колоде
`q = (i - k) mod n`; передняя (`q` только что стала `n-1`) в начале шага
летит вниз `y += interpolate(spring(local), [0,1], [0, clearance])`, затем
переносится назад; остальные — `slot(q + 1 - spring(local - q*0.05*fps))`.
`transform` и затемнение — те же формулы `write()` в рендере. Убрать rAF,
таймеры, drag, parallax, `ResizeObserver` (масштаб задать явно).

## Паттерны

`sequence-steps`, `comparison`
