# TextType — `react-bits/text-type`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `engine:gsap`, `dom`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Эффект пишущей машинки: строки печатаются по символу, курсор (символ, бар,
блок или подчёркивание) мигает и скользит, затем текст стирается backspace'ом
или «выделением» и печатается следующая строка. Опции: постоянный префикс,
опечатки с исправлением, fade/blur/rise у каждой буквы, цвета по строкам.

## Когда использовать

Промпт в AI-ролике, «вводим запрос», перебор вариантов после фиксированного
начала («Мы создаём ___»). Окно терминала — в категории `ui-mockups`.

## Фразы из озвучки

- «Просто напишите, что вам нужно»
- «Введём запрос и посмотрим на результат»
- «Мы создаём сайты, приложения и бренды»

## Визуальный стиль

Типографика родителя (`div` по умолчанию), курсор `|` с мягким миганием 0,5 с.
Темп: 50 мс на символ, 30 мс на удаление, пауза 2 с.

## Входные данные

`text` (строка или массив), `as='div'`, `typingSpeed=50`, `initialDelay=0`,
`pauseDuration=2000`, `deletingSpeed=30`, `deleteMode='backspace'`
(`backspace|select`), `loop=true`, `className`, `showCursor=true`,
`hideCursorWhileTyping=false`, `cursorStyle='character'`
(`character|bar|block|underscore`), `cursorCharacter='|'`,
`cursorColor='currentColor'`, `cursorClassName`, `cursorBlinkDuration=0.5`,
`cursorGlide=true`, `typeEffect='none'` (`fade|blur|rise`), `mistakes=0`,
`prefix=''`, `prefixColor`, `textColors=[]`, `variableSpeed {min,max}`,
`onSentenceComplete`, `startOnVisible=false`, `reverseMode=false`.

## Анимации

Цепочка `setTimeout` — машина состояний (печать / опечатка / пауза /
удаление / следующая строка); мигание курсора — `gsap.timeline({repeat:-1})`,
скольжение курсора — `gsap.to(x,y)` по `offsetLeft/Top` каретки; эффект
буквы — WAAPI `node.animate`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/TextType/TextType.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/TextType/TextType.css` — курсоры
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/TextType/TextType.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/TextTypeDemo.jsx` — демо
- https://reactbits.dev/text-animations/text-type

## Зависимости

`gsap` (мигание и скольжение курсора).
## Совместимость и адаптация

`adaptable` при фиксированной скорости и `mistakes=0`: число напечатанных
символов — функция кадра. Рецепт: `ms = frame/fps*1000 - initialDelay`,
`shown = clamp(floor(ms/typingSpeed), 0, total)`, затем пауза и
`shown = total - floor((ms - typed - pause)/deletingSpeed)`; индекс строки —
по накопленной длительности циклов. Курсор: `opacity` от
`(frame/fps) % (2*cursorBlinkDuration)`, ставить сразу за последним символом
(инлайн, без `gsap.to`). `variableSpeed`/`mistakes` используют `Math.random` —
заменить на `random(seed)` или отключить; WAAPI-эффект букв считать от
возраста символа.

## Паттерны

`sequence-steps`, `key-point-emphasis`
