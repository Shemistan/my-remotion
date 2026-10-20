# RotatingText — `react-bits/rotating-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `timers`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Слово или фраза, которая по таймеру сменяется следующей из списка: буквы
уезжают и въезжают (slide), переворачиваются (flip), проявляются из blur,
масштабируются или падают с отскоком; опционально — цветная плашка,
плавно подстраивающая ширину под слово.

## Когда использовать

«Мы делаем ___ для ___», перечисление аудиторий/сценариев/языков в одной
позиции фразы. Для перебора с фокусом на словах внутри фразы — `react-bits/true-focus`.

## Фразы из озвучки

- «Подходит для дизайнеров, разработчиков и маркетологов»
- «Работает на iOS, Android и в вебе»
- «Создавайте быстрее, проще, смелее»

## Визуальный стиль

Без своего цвета; при `highlight` — плашка `#a855f7` с автоконтрастным
текстом. Пружинные переходы (damping 25, stiffness 300), интервал 2 с.

## Входные данные

`texts` (обяз.), `transition`, `initial`, `animate`, `exit` (свои motion-состояния),
`effect='slide'` (`slide|flip|blur|scale|drop`), `direction='up'` (`up|down`),
`highlight=false`, `highlightColor='#a855f7'`, `animatePresenceMode='wait'`,
`animatePresenceInitial=false`, `rotationInterval=2000` (мс),
`staggerDuration=0`, `staggerFrom='first'` (`first|last|center|random|число`),
`loop=true`, `auto=true`, `pauseOnHover=false`, `blur=0`,
`splitBy='characters'` (`characters|words|lines|строка`), `onNext`,
`mainClassName`, `splitLevelClassName`, `elementLevelClassName`, `style`;
ref-методы `next/previous/jumpTo/reset`.

## Анимации

`setTimeout(next, rotationInterval)` переключает индекс; `AnimatePresence`
проигрывает exit старого и enter нового, у каждой буквы `delay` по stagger;
ширина плашки — `animate(width, …, spring)` после `ResizeObserver`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/RotatingText/RotatingText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/RotatingText/RotatingText.css` — раскладка
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/RotatingText/RotatingText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/RotatingTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/rotating-text

## Зависимости

`motion` (`motion`, `AnimatePresence`, `MotionConfig`, `animate`, `useMotionValue`).

## Совместимость и адаптация

`adaptable`. Рецепт: `interval = rotationInterval/1000*fps`,
`index = floor(frame/interval) % texts.length`, `local = frame % interval`;
вход буквы `i` — `spring({frame: local - i*staggerFrames, fps, config:{damping:25, stiffness:300}})`
→ `translateY` 100%→0 и opacity; выход старого слова — в последних кадрах
интервала (или наложением предыдущего индекса). `AnimatePresence`,
`setTimeout`, `layout`-анимацию и `random`-перемешивание через `Math.random`
заменить расчётом (ширину плашки — измерить слова заранее и интерполировать).

## Паттерны

`transformation`, `key-point-emphasis`
