# FuzzyText — `react-bits/fuzzy-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `timers`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Крупное слово на канвасе, «дрожащее» как плохой ТВ-сигнал: каждая
строка пикселей случайно смещается по горизонтали (или вертикали /
обоим), опционально с расслоением RGB-каналов. Интро — слово
проявляется из сильного шума; `glitchMode` — периодические всплески.

## Когда использовать

«Помехи», «нестабильность», 404, ощущение тревоги, ретро-VHS. Для
быстрого чистого глитча с полосами — `glitch-text`.

## Фразы из озвучки

- «сигнал теряется»
- «картинка начинает плыть»
- «404 — страница не найдена»

## Визуальный стиль

Аналоговый шум, `fontWeight=900`, `clamp(2rem, 8vw, 8rem)`, цвет
текущего текста или градиент `gradient=[…]`.

## Входные данные

`children`, `fontSize='clamp(2rem, 8vw, 8rem)'`, `fontWeight=900`,
`fontFamily='inherit'`, `color='currentColor'`, `enableHover=true`,
`baseIntensity=0.18`, `hoverIntensity=0.5`, `fuzzRange=30`, `fps=60`,
`direction='horizontal'` (`horizontal|vertical|both`),
`transitionDuration=0`, `clickEffect=false`, `glitchMode=false`,
`glitchInterval=2000`, `glitchDuration=200`, `gradient=null`,
`letterSpacing=0`, `sliceSize=1`, `trigger='hover'`
(`hover|always|click`), `intro=false`, `introDuration=1400`,
`colorSplit=0`, `className=''`.

## Анимации

rAF с ограничением `fps`: на каждом тике новые смещения строк
`(Math.random() - 0.5) * intensity * fuzzRange`, `drawImage` полосами с
исходного офскрин-канваса; интенсивность — от hover/always, интро
(огибающая `(1-p)^2.5`), всплесков `setTimeout`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/FuzzyText/FuzzyText.jsx` — компонент
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/FuzzyText/FuzzyText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/FuzzyTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/fuzzy-text

## Зависимости

`react`; 2D Canvas.

## Совместимость и адаптация

`complex`: Canvas + rAF + `setTimeout` + `Math.random` каждый кадр.
Рецепт: оставить `build()`/`paintSource()`/`fuzz()`; в `useEffect` по
`frame` вызывать `draw()` с `intensity`, вычисленной из кадра (интро —
та же огибающая от `frame/fps`), смещения строк — `random(\`fz-${frame}-
${row}\`)`; `glitchMode` — по `frame % interval`; обернуть сборку в
`delayRender` до загрузки шрифта.

## Паттерны

`cause-effect`, `abstract-concepts`
