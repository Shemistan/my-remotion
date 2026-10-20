# ScrollStack — `react-bits/scroll-stack`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | unsuitable |
| Флаги | `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Вертикальная лента карточек, которые при прокрутке «прилипают» к верху
и складываются в стопку: нижние уменьшаются, затемняются, опционально
размываются и наклоняются, образуя колоду.

## Когда использовать

На сайте — сторителлинг по скроллу. В видео только как идея «пункты
складываются в стопку»; готовый компонент без скролла не двигается —
для автоматической стопки см. `react-bits/card-swap`.

## Фразы из озвучки

- «Шаг за шагом мы собираем полную картину»
- «Каждый этап ложится поверх предыдущего»
- «Итак, все этапы позади»

## Визуальный стиль

Крупные карточки-фото со скруглением, отступ между ними 100 px, в стопке
24 px, базовый масштаб 0.8 (−0.05 на карту), затемнение 0.2.

## Входные данные

`children` (`<ScrollStackItem itemClassName style>`), `className`,
`itemDistance=100`, `itemStackDistance=24`, `stackPosition='15%'`,
`itemScale=0.05`, `baseScale=0.8`, `dimAmount=0.2`, `blurAmount=0`,
`tiltAmount=0`, `rotationAmount=0`, `holdDistance=200`, `smoothScroll=true`,
`snap=false`, `useWindowScroll=false`, `onStackComplete`.

## Анимации

На каждый скролл (rAF) читаются `getBoundingClientRect` слотов, считается
«покрытие» `cover` каждой карты следующими и из него — масштаб,
затемнение, blur, наклон; собственный плавный скролл и snap.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/ScrollStack/ScrollStack.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/ScrollStack/ScrollStack.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/ScrollStack/ScrollStack.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/ScrollStackDemo.jsx` — демо
- https://reactbits.dev/components/scroll-stack

## Зависимости

Нет внешних пакетов.

## Совместимость и адаптация

`unsuitable` как есть: единственный двигатель — прокрутка контейнера и
DOM-измерения. Если нужен эффект в видео, переписать: виртуальный
«скролл» `s = interpolate(frame, …)`, позиция карты `j`
`top_j = max(stackTop + j*itemStackDistance, flow_j - s)`, `cover` и из него
`scale = baseScale + …`, `dim`, `blur` — те же формулы `update()`, но от `s`
без чтения DOM. Файл прочитан частично (props и начало `update()`).

## Паттерны

`sequence-steps`, `timeline`
