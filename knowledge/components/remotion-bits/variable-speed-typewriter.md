# Variable Speed & Typos (bit) — `remotion-bits/variable-speed-typewriter`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Фраза печатается «по-человечески»: быстро в начале, медленнее в середине,
снова быстро в конце; примерно на каждом десятом символе делается
опечатка, которая через паузу стирается и исправляется. Курсор `_`.

## Когда использовать

Имитация живого набора человеком: чат, письмо, неуверенность, «он
задумался», ошибки и их исправление. Ровная печать — `basic-typewriter`.

## Фразы из озвучки

- «мы все ошибаемся, когда торопимся»
- «он долго подбирал слова»
- «система сама поправит опечатку»

## Визуальный стиль

Жирный моноширинный `6vmin`, красный `#ff6b6b`, курсор `_` мигает каждые
20 кадров. 400 кадров, 1920×1080.

## Входные данные

Без props: `text` = "Typing with errors and variable speed...",
`typeSpeed={[2, 10, 2]}` (кадров/символ по ходу строки), `errorRate={0.1}`,
`errorCorrectDelay={10}`, `cursor={<span>_</span>}`, `blinkSpeed={20}`.

## Анимации

Скорость печати интерполируется по позиции символа; опечатки
детерминированы `random(seed)` (seed по умолчанию "typewriter"); на опечатку
— неверный символ, пауза 10 кадров, backspace, верный символ.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/typewriter/VariableSpeedTypewriter.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/variable-speed-typewriter.mdx` — документация

## Зависимости

`remotion-bits` (`TypeWriter`, `useViewportRect`); registry: `type-writer`.
Карточка компонента — `type-writer.md`.

## Совместимость и адаптация

`native`. Другой набор опечаток — сменить `seed`. Задать фон и выравнивание.

## Паттерны

`transformation`, `key-point-emphasis`
