# ASCIIText — `react-bits/ascii-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `canvas`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Слово, отрисованное сеткой ASCII-символов на полноэкранном WebGL2-канвасе:
плоскость с текстом волнуется и наклоняется, цвета — градиент из трёх
цветов с хроматическим сдвигом, на старте «декодируется» из случайных
глифов. Наведение — скрэмбл у курсора, клик — кольцевая рябь.

## Когда использовать

Техно/хакерские заставки, «цифровая» тема, ретро-терминал: крупное
короткое слово на тёмном фоне. Занимает весь родитель (`position:
absolute; inset: 0`). Для текста в строке не подходит.

## Фразы из озвучки

- «всё начинается с кода»
- «данные превращаются в смысл»
- «добро пожаловать в цифровой мир»

## Визуальный стиль

Моноширинный ASCII-арт (IBM Plex Mono), тёмная тема, градиент
`['#ff6188', '#fc9867', '#ffd866']`, мягкая волна и RGB-сдвиг; есть
`theme='light'` (инверсия).

## Входные данные

`text='Hey!'`, `asciiFontSize=8`, `charset` (строка глифов), `fontFamily`,
`fontWeight=600`, `textColor='#fdf9f3'`, `colors=[3 цвета]`,
`textScale=1`, `blocks=0.9`, `waves=1`, `waveSpeed=1`, `chroma=1`,
`tilt=1`, `hueShift=1`, `scramble=0.6`, `clickRipple=true`, `intro=true`,
`idle=true`, `interactive=true`, `theme='dark'`, `className=''`, `style?`.

## Анимации

Шейдер берёт `uTime` (накопленный `dt` из rAF): волна плоскости
`sin(uTime * uWaveSpeed)`, хроматический сдвиг, смена глифов
`floor(uTime * 18)`; idle-наклон `sin(time * 0.55)`, интро `uIntro` от 1
к 0 за 1.4 с; hover/ripple — от указателя.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/ASCIIText/ASCIIText.jsx` — компонент (шейдеры встроены)
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/ASCIIText/ASCIIText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/ASCIITextDemo.jsx` — демо
- https://reactbits.dev/text-animations/ascii-text

## Зависимости

`react`; чистый WebGL2 без three/ogl; текстуры текста и глифов рисуются
во вспомогательных 2D-канвасах.

## Совместимость и адаптация

`complex`: WebGL2 + rAF + `ResizeObserver`/`IntersectionObserver`.
Шейдер детерминирован от униформ (hash по ячейке и `tick`), поэтому
переносится: убрать rAF, в `useEffect` на каждый кадр выставить
`uTime = frame / fps`, `uIntro = max(0, 1 - frame/fps/1.4)`, наклон по
idle-формуле от того же времени, `uHover=0`, рипплы пустые, и вызвать
`drawArrays`; обернуть в `delayRender` до загрузки шрифтов и сборки
текстур. Нужен рендер с GPU (`--gl=angle`).

## Паттерны

`abstract-concepts`, `key-point-emphasis`
