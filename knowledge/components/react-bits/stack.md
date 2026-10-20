# Stack — `react-bits/stack`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `raf`, `timers`, `dom`, `user-events`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Стопка карточек (фото или любой контент) в раскладке веер, каскад, колода или
россыпь; верхняя карточка улетает и подкладывается вниз, остальные
подтягиваются вперёд с пружиной и затенением глубины.

## Когда использовать

Перелистывание примеров, кейсов, отзывов, фото «одно за другим»; идея
«следующий вариант». Для 3D-ротации колоды по таймеру — `react-bits/card-swap`.

## Фразы из озвучки

- «Листаем наши лучшие проекты»
- «Вот ещё один пример, и ещё один»
- «Каждая карточка — отдельная история клиента»

## Визуальный стиль

Скруглённые карточки (16px), мягкая тень, опциональная белая рамка; веер с
поворотом 8°·spread на позицию; пружинные, «физичные» движения.

## Входные данные

`cards` (ReactNode[]; по умолчанию 4 фото Unsplash), `layout='fan'`
(`fan|cascade|deck|pile`), `visible=4`, `spread=0.5`, `depth=0.5`,
`radius=16`, `frame=0`, `frameColor='#ffffff'`, `shadow=true`, `tilt=30`,
`threshold=90`, `speed=1`, `sendToBackOnClick=false`, `autoplay=false`,
`autoplayDelay=3000`, `pauseOnHover=false`, `onChange`, `className`, `style`.

## Анимации

Позиция карточки — чистая функция `placement(layout, position)`; переходы —
`animate(motionValue, target, spring)` из motion со stagger 0.06 с на входе.
Автоплей — `setTimeout` → `sendToBack`: вылет по направлению `EXITS[layout]`,
rAF следит за пересечением карточек и «подкладывает» её под низ.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/Stack/Stack.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/Stack/Stack.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/Stack/Stack.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/StackDemo.jsx` — демо
- https://reactbits.dev/components/stack

## Зависимости

`motion` (`animate`, `motion`, `motionValue`).

## Совместимость и адаптация

`adaptable` в режиме autoplay: раскладка детерминирована. Рецепт:
`step = floor(frame / delayFrames)`, порядок = циклический сдвиг на `step`;
`p = spring({frame: frame % delayFrames, fps})` и интерполяция от
`placement(prev)` к `placement(next)`; улетающая карточка — `x/y` по
`EXITS[layout]` в первой половине `p`, затем возврат на последнюю позицию с
zIndex внизу. Drag, rAF-проверку пересечений, таймеры убрать; картинки — через
`staticFile`/`Img` (дефолтные — Unsplash по сети).

## Паттерны

`sequence-steps`, `comparison`
