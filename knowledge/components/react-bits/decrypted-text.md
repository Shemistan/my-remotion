# DecryptedText — `react-bits/decrypted-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `dom`, `canvas`, `engine:motion`, `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

«Хакерская» расшифровка: буквы мелькают случайными символами и по очереди
(или все сразу после N итераций) встают в настоящий текст. Варианты:
`scramble`, `fade` (символы «разгораются»), `flip` (табло-переворот),
акцентный цвет у ещё зашифрованных букв.

## Когда использовать

Безопасность, шифрование, данные, взлом, «раскрываем секрет», тех-интро.
Для перебора с «колонками-барабанами» — `react-bits/shuffle`.

## Фразы из озвучки

- «Данные зашифрованы и надёжно защищены»
- «Расшифруем, что скрывается за этим кодом»
- «Доступ получен»

## Визуальный стиль

Моноширинно-технический характер (шрифт задаёт родитель), набор символов
`A–Z a–z !@#$%^&*()_+` по умолчанию; ширина «чужого» символа ужимается
`scaleX`, чтобы строка не прыгала.

## Входные данные

`text`, `speed=50` (мс на итерацию, мин. 16), `maxIterations=10`,
`sequential=false`, `revealDirection='start'` (`start|end|center|random`),
`useOriginalCharsOnly=false`, `characters`, `className`, `parentClassName`,
`encryptedClassName`, `animateOn='hover'` (`hover|view|inViewHover|click`),
`clickMode='once'` (`once|toggle`), `effect='scramble'` (`scramble|fade|flip`),
`scrambleColor=''`, `loop=false`, `loopDelay=2000`, `hoverRadius=0`, `...props`.

## Анимации

`setInterval(tick, speed)`: на каждой итерации обновляется маска раскрытых
букв (последовательно или разом), неоткрытые получают `pool[Math.random()]`.
`flip` — WAAPI `node.animate` с `rotateX`; `fade/tint` — CSS-transition;
ширины глифов меряются через canvas `measureText`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/DecryptedText/DecryptedText.jsx` — компонент
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/DecryptedText/DecryptedText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/DecryptedTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/decrypted-text

## Зависимости

`motion` (только `motion.span` как обёртка).

## Совместимость и адаптация

`adaptable` при `animateOn='view'`: движок — счётчик итераций, его легко
выразить через кадр. Рецепт: `iteration = floor((frame - start) * 1000 / fps / speed)`;
в `sequential` раскрыто первых `iteration` букв в порядке `revealDirection`,
иначе всё раскрыто при `iteration >= maxIterations`; глиф неоткрытой буквы
`pool[floor(random(\`${i}-${iteration}\`) * pool.length)]` из remotion.
`setInterval`, hover/click, WAAPI-flip и CSS-transition убрать (flip и fade
считать по доле итерации). Разметку ячеек (ghost + glyph) оставить.

## Паттерны

`transformation`, `key-point-emphasis`
