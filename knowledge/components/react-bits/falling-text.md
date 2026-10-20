# FallingText — `react-bits/falling-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | complex |
| Флаги | `engine:other`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Абзац текста, который рассыпается на слова (или буквы) и падает с
физикой в кучу на дно контейнера: части сталкиваются, сбивают соседей,
отскакивают; выделенные слова подсвечены акцентом. Вариант `tiles` —
слова на плашках-«карточках». Потом может «прилететь» обратно на место.

## Когда использовать

Метафора краха, хаоса, «всё развалилось», разбор фразы на части. Хорош
как финальный удар перед сменой сцены. Не для спокойного появления
текста.

## Фразы из озвучки

- «и тут всё рухнуло»
- «старый план просто развалился»
- «слова больше ничего не значат»
- «куча задач, которые свалились разом»

## Визуальный стиль

Игривый, физический; в `tiles` — карточки с градиентом и тенью
(dark/light), акцент `accentColor='#5b8cff'`.

## Входные данные

`text=''`, `highlightWords=[]`, `highlightClass='highlighted'`,
`trigger='auto'` (`auto|hover|click|scroll`), `variant='text'`
(`text|tiles`), `split='words'` (`words|letters`), `gravity=1`,
`bounciness=0.2`, `scatter=0.5`, `stagger=0.03`, `order='random'`
(`random|center|together|…`), `draggable=true`,
`mouseConstraintStiffness=0.2`, `cursorPush=0.5`, `restoreDelay=0`,
`fontSize='1rem'`, `accentColor`, `theme='dark'`,
`backgroundColor='transparent'`, `wireframes=false`, `className`, `style`.

## Анимации

matter-js: тела-прямоугольники по `getBoundingClientRect` частей, стены
по краям, фиксированный шаг 1/120 с в rAF с интерполяцией; старт с
задержкой `rank * stagger`, случайный толчок `Math.random()`. Возврат —
Web Animations API (`element.animate`) с spring-`linear()`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/FallingText/FallingText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/FallingText/FallingText.css` — стили плашек
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/FallingText/FallingText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/FallingTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/falling-text

## Зависимости

`react`, `matter-js`.

## Совместимость и адаптация

`complex`: физический движок в реальном времени, `Math.random`, DOM-
измерения, WAAPI. Для видео: детерминированная симуляция — заменить
`Math.random` на `random(seed)`, на каждом кадре прогонять движок с
нуля до `frame` фиксированными шагами (или закешировать траектории
один раз в `delayRender` и брать позиции по индексу кадра), трансформы
выставлять в рендере; события указателя удалить; возврат — через
`interpolate`.

## Паттерны

`cause-effect`, `transformation`, `key-point-emphasis`
