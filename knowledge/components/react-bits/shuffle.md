# Shuffle — `react-bits/shuffle`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | complex |
| Флаги | `engine:gsap`, `dom`, `raf`, `svg`, `canvas`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Текст, буквы которого прокручиваются, как барабаны слот-машины: каждая
ячейка пролистывает ленту случайных символов и останавливается на нужной
букве (через чёт/нечет, от центра, по порядку). Варианты `flip` (карточки в
3D) и `blur` (вращение на месте с motion-blur), акцентный цвет у промежуточных
символов.

## Когда использовать

Розыгрыш, «выпадает результат», подбор имени/кода, тех-интро с ощущением
механики. Для «расшифровки» без барабанов — `react-bits/decrypted-text`;
для табло вылетов — `react-bits/split-flap-text`.

## Фразы из озвучки

- «Барабан крутится… и выпадает ваш выигрыш»
- «Подбираем идеальное название»
- «Перемешаем и посмотрим, что получится»

## Визуальный стиль

Механический, игровой; типографика родителя (`p`, по центру). Быстро:
0,35 с на ячейку, stagger 0,03 с, `power3.out`.

## Входные данные

`text`, `className`, `style={}`, `shuffleDirection='right'` (`left|right|up|down`),
`duration=0.35`, `maxDelay=0`, `ease='power3.out'`, `threshold=0.1`,
`rootMargin='-100px'`, `tag='p'`, `textAlign='center'`, `onShuffleComplete`,
`shuffleTimes=1`, `animationMode='evenodd'` (`evenodd|center|sequence|random`),
`loop=false`, `loopDelay=0`, `stagger=0.03`, `scrambleCharset=''`,
`colorFrom`, `colorTo`, `triggerOnce=true`, `respectReducedMotion=true`,
`triggerOnHover=true`, `effect='slide'` (`slide|flip|blur`), `hoverRadius=0`,
`motionBlur=false`, `color`, `accentColor`.

## Анимации

GSAP `SplitText` режет на буквы, затем код императивно оборачивает каждую
букву в ячейку с лентой клонов (`replaceChildren`), меряет её
`getBoundingClientRect`/canvas `measureText`; `gsap.timeline` двигает ленту
по оси, blur — набор SVG-фильтров, добавляемых в `document.body`. Старт —
`ScrollTrigger`, повтор по hover; символы — `Math.random`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/Shuffle/Shuffle.jsx` — компонент
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/Shuffle/Shuffle.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/ShuffleDemo.jsx` — демо
- https://reactbits.dev/text-animations/shuffle

## Зависимости

`gsap` (+ `ScrollTrigger`, `SplitText`), `@gsap/react`.

## Совместимость и адаптация

`complex`: анимация строится императивной перестройкой DOM вне React.
Проще воспроизвести в React: для буквы `i` ячейка `overflow:hidden` шириной
буквы с колонкой `[буква, …shuffleTimes случайных через random(\`${i}-${k}\`), буква]`,
`translateX/Y = interpolate(frame - offset_i, [0, dur], [-span, 0], easing)`;
`offset_i` — по формуле `animationMode` (evenodd: нечётные первыми).
Альтернатива — `gsap.timeline({paused:true}).seek(frame/fps)` после
`delayRender` (хрупко из-за `ScrollTrigger` и DOM-мутаций).

## Паттерны

`transformation`, `key-point-emphasis`
