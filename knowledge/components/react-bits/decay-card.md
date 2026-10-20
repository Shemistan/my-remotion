# DecayCard — `react-bits/decay-card`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events`, `async-data`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Карточка-изображение, края которого «распадаются» и плавятся турбулентным
шумом (смещение по simplex-noise, опционально хроматическое расщепление и
ч/б), а затем собираются обратно; в покое края слегка «тлеют».

## Когда использовать

Распад, разрушение, «память стирается», ностальгия, глитч-арт, переход к
воспоминанию. Не для чистой подачи фото — шум искажает картинку.

## Фразы из озвучки

- «Старые подходы буквально разваливаются»
- «Воспоминания постепенно стираются»
- «Всё, что казалось прочным, распадается»

## Визуальный стиль

Портретная карточка 300×400, мягкий органический шум по краям, опционально
grayscale и цветные кромки; атмосферно, арт-хаус.

## Входные данные

`image` (URL, по умолчанию Unsplash), `width=300`, `height=400`,
`intensity=0.5`, `sensitivity=0.5`, `hoverDecay=0.05`, `recovery=0.6`,
`grain=0.25`, `detail=5` (октавы 1–8), `pattern=4` (seed), `idle=0.35`,
`flow=0`, `chroma=0`, `travel=50`, `tilt=10`, `scope='window'`
(`window|card`), `radius=0`, `grayscale=false`, `children`, `className`, `style`.

## Анимации

WebGL2-фрагментный шейдер: `uScale` (сила распада) растёт от скорости курсора
и затухает за `recovery`; `uIdle` + `uTime` дают фоновое «тление» краёв;
сама карточка смещается/поворачивается вслед курсору (rAF, transform).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/DecayCard/DecayCard.jsx` — компонент и шейдеры
- `templates/react-libriry/react-bits/src/content/Components/DecayCard/DecayCard.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/DecayCard/DecayCard.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/DecayCardDemo.jsx` — демо
- https://reactbits.dev/components/decay-card

## Зависимости

Нет npm-пакетов: чистый WebGL2 (`canvas.getContext('webgl2')`).

## Совместимость и адаптация

`complex`: рендер в собственном WebGL-цикле. Рецепт: на каждый кадр
`useEffect` с `draw()`, где `uTime = frame/fps`, `uScale = intensity*440*level(frame)`
(уровень распада задать кривой `interpolate`, а не скоростью курсора),
`uIdle` — как есть; загрузку текстуры обернуть `delayRender/continueRender`,
картинку брать через `staticFile` (CORS). Курсор, rAF, `IntersectionObserver`
убрать. Нужен рендер с GL (`--gl=angle`/`swangle`).

## Паттерны

`transformation`, `abstract-concepts`
