# ScrambledText — `react-bits/scrambled-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | complex |
| Флаги | `engine:gsap`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Моноширинный абзац, буквы которого при появлении «расшифровываются»
из символов `.:` слева направо (интро). Дальше — реакция на курсор:
буквы рядом перемешиваются, приподнимаются, размываются или
увеличиваются линзой; клик пускает волну перемешивания.

## Когда использовать

В видео — только интро-расшифровка: «загрузка», «декодирование
сообщения», терминальный текст. Для заголовков с перебором символов
смотреть также decrypted-text/shuffle (другие срезы).

## Фразы из озвучки

- «расшифровываем сообщение»
- «система получила ответ»
- «за этими символами скрыт смысл»

## Визуальный стиль

Терминальный/хакерский: `font-family: monospace`,
`clamp(14px, 4vw, 32px)`, мелкие точки-заполнители.

## Входные данные

`radius=100`, `duration=1.2`, `speed=0.5`, `scrambleChars='.:'`,
`scrambleColor=''`, `effect='scramble'` (`scramble|lift|blur|magnify`),
`strength=1`, `trail=0.6`, `clickBurst=true`, `intro=true`,
`fontFamily=''`, `color=''`, `className=''`, `style={}`, `children`.

## Анимации

GSAP `SplitText` режет на буквы; интро — `gsap.timeline({paused:true})`
c `ScrambleTextPlugin` для каждой буквы, `revealDelay = 0.15 + duration *
(0.75 * i/n + 0.25 * Math.random())`, запуск по `IntersectionObserver`.
Курсорные эффекты — rAF с энергией букв и волнами клика.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/ScrambledText/ScrambledText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/ScrambledText/ScrambledText.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/ScrambledText/ScrambledText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/ScrambledTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/scrambled-text

## Зависимости

`react`, `gsap` (+ `gsap/SplitText`, `gsap/ScrambleTextPlugin`).

## Совместимость и адаптация

`complex`: основной смысл — курсор (непригоден), интро пригодно, но
`ScrambleTextPlugin` выбирает символы случайно на каждом обновлении, а
задержки содержат `Math.random` — `timeline.time(frame/fps)` не даст
одинаковых кадров. Рецепт: переписать интро без GSAP — для буквы `i`
задержка из `random(\`sc-${i}\`)`, до неё символ
`scrambleChars[floor(random(\`${i}-${frame}\`) * len)]`, после — оригинал;
SplitText заменить на `Array.from(text)`.

## Паттерны

`transformation`, `abstract-concepts`
