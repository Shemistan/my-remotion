# CLI Simulation (bit) — `remotion-bits/cli-simulation`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `ui-mockups` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Окно терминала: после приглашения `➜ ~` пользователь печатает
`npm install remotion-bits`, затем система быстро выводит строки
«✔ Package found», «✔ Dependencies resolved», «✔ Installing...», «Done in 1.4s».

## Когда использовать

Установка пакета, запуск CLI, деплой, «одна команда — и готово»,
девелоперские туториалы. Для 3D-сцены с несколькими терминалами —
`bit-terminal-3d`; для кода с подсветкой — `code-block`.

## Фразы из озвучки

- «установка занимает одну команду»
- «запускаем npm install — и всё готово»
- «через пару секунд зависимости установлены»

## Визуальный стиль

Фон `#1e1e1e` (VS Code), шрифт `'JetBrains Mono', 'Fira Code', monospace`
`3vmin`, текст `#d4d4d4`, стрелка `#4ec9b0`, `~` `#569cd6`, команда
`#ce9178`; отступ `10vmin`. 450 кадров, 1920×1080.

## Входные данные

Без props. Первый `TypeWriter`: `text` команды, `typeSpeed={3}`,
`deleteSpeed={1}`, `showCursorAfterComplete={false}`, `transition={{duration:100,
delay:0}}`. Второй: массив из 4 строк с `\n`, `transition={{delay:90}}`,
`typeSpeed={0.5}`, `pauseAfterType={20}`, `deleteBeforeNext={false}`,
`cursor={false}`.

## Анимации

Команда печатается 3 кадра/символ (~75 кадров), курсор исчезает после
печати; вывод стартует с кадра 90 и дописывается строками (0.5 кадра/символ,
пауза 20 между строками).

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/typewriter/CLISimulation.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/cli-simulation.mdx` — документация

## Зависимости

`remotion-bits` (`TypeWriter`, `useViewportRect`); registry: `type-writer`.
Карточка компонента — `type-writer.md`.

## Совместимость и адаптация

`native`. Шрифты JetBrains Mono/Fira Code не загружаются — подключить
через `@remotion/google-fonts` или `@remotion/fonts` с `delayRender`, иначе
fallback monospace. Задержку вывода (90) подбирать под длину команды.
Окно без «рамки» — заголовок с кнопками добавить самому при желании.

## Паттерны

`sequence-steps`, `cause-effect`
