# TextCursor — `react-bits/text-cursor`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `interactive-widgets` |
| Совместимость с Remotion | unsuitable |
| Флаги | `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

След из текста или эмодзи за курсором: «штампы»-копии, которые
появляются с отскоком, плавают и исчезают (`stamp`), цепочка копий за
указателем (`chain`) или лента букв, вытянутая вдоль траектории
(`ribbon`).

## Когда использовать

На сайте — декоративный курсор. В видео курсора нет: только если
переписать с заданной траекторией (например, след за «летящим» словом),
что по сути новый компонент. Для имитации курсора в UI-мокапе лучше
отдельный курсор-компонент.

## Фразы из озвучки

- «куда ни посмотри — везде наш продукт»
- «оставляем след»
- «идея тянется за нами»

## Визуальный стиль

Игривый, лёгкий: `fontSize=28`, `fontWeight=600`, плавное покачивание,
сжатие и затухание хвоста.

## Входные данные

`text='Hello'`, `mode='stamp'` (`stamp|chain|ribbon`), `spacing=88`,
`maxPoints=7`, `followMouseDirection=true`, `randomFloat=true`,
`exitDuration=0.5`, `removalInterval=30`, `shrink=0.5`, `fade=0.6`,
`smoothing=0.3`, `popIn=true`, `keepUpright=true`, `hideCursor=false`,
`color='currentColor'`, `fontSize=28`, `fontWeight=600`,
`fontFamily='inherit'`, `className=''`, `style?`.

## Анимации

rAF: голова сглаженно следует за `pointermove`, путь сэмплируется по
длине дуги; штампы рождаются каждые `spacing` px с `backOut`-появлением,
`Math.random()`-фазой покачивания и затуханием `smootherstep`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/TextCursor/TextCursor.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/TextCursor/TextCursor.css` — слой и элементы
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/TextCursor/TextCursor.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/TextCursorDemo.jsx` — демо
- https://reactbits.dev/text-animations/text-cursor

## Зависимости

`react`; `Intl.Segmenter` для графем (с фолбэком).

## Совместимость и адаптация

`unsuitable`: без движения указателя ничего не появляется. Если очень
нужно — вход `pointermove` заменить заданной траекторией `path(frame)`,
состояние штампов вычислять из кадра (момент рождения = длина пути /
`spacing`), `Math.random` → `random(seed)`; это фактически переписывание.

## Паттерны

`abstract-concepts`
