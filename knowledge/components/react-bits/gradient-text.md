# GradientText — `react-bits/gradient-text`

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

Текст, залитый «живым» градиентом: скользящая линейная полоса цветов,
дрейфующая сетка радиальных пятен (`flow`) или качающийся конический веер
(`conic`); опционально — градиентная рамка-пилюля и свечение.

## Когда использовать

Бренд-заголовок, название продукта, слово-акцент в креативном/AI-ролике.
Для одиночного блика вместо переливов — `react-bits/shiny-text`.

## Фразы из озвучки

- «Добро пожаловать в будущее дизайна»
- «Искусственный интеллект меняет всё»
- «Яркий старт новой линейки»

## Визуальный стиль

Фиолетово-розовая палитра по умолчанию (`#5227FF`, `#FF9FFC`, `#B497CF`),
`background-clip: text`, медленный цикл 8 с; выглядит современно, «техно-креатив».

## Входные данные

`children`, `colors=['#5227FF','#FF9FFC','#B497CF']`, `animationSpeed=8` (с на цикл),
`variant='linear'` (`linear|flow|conic`), `angle=90`, `direction`
(`horizontal|vertical|diagonal`, переопределяет угол), `scale=3` (1–6),
`yoyo=true`, `glow=0`, `showBorder=false`, `borderWidth=1.5`,
`pauseOnHover=false`, `followPointer=false`, `className`, `style`.

## Анимации

rAF накапливает `state.time`; `paint()` строит `--gt-gradient` как функцию
`cycle = time / speed` (смещение стопов, позиции пятен по `sin`, угол конуса).
Курсор подтягивает градиент пружиной; `IntersectionObserver` паузит вне экрана.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/GradientText/GradientText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/GradientText/GradientText.css` — маска-рамка и glow
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/GradientText/GradientText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/GradientTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/gradient-text

## Зависимости

Нет внешних пакетов (React + CSS).

## Совместимость и адаптация

`adaptable`: картинка — чистая функция времени. Рецепт: вынести тело `paint()`
в функцию `(time, settings) → backgroundImage`, вызывать с `time = frame / fps`
и писать результат в inline-переменную `--gt-gradient` при рендере (без
`useEffect`). rAF, `IntersectionObserver`, pointer-пружину (`followPointer`)
и `pauseOnHover` убрать (`state.pull = 0`).

## Паттерны

`key-point-emphasis`, `abstract-concepts`
