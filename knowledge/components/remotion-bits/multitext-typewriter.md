# Multi-Text Typewriter (bit) — `remotion-bits/multitext-typewriter`

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

Три фразы печатаются по очереди: каждая набирается, держится, стирается
посимвольно, затем печатается следующая; после последней цикл начинается
заново.

## Когда использовать

Перебор вариантов в одном месте: «для X… для Y… для Z», смена ролей,
аудиторий, сценариев использования. Одна фраза — `basic-typewriter`.

## Фразы из озвучки

- «для дизайнеров, для разработчиков, для маркетологов»
- «пишите статьи, письма, сценарии»
- «один инструмент — множество задач»

## Визуальный стиль

Жирный моноширинный шрифт `7vmin`, цвет наследуется; курсор `|`. 300 кадров,
1920×1080.

## Входные данные

Без props: `text` = ["First sentence.", "Second longer sentence.",
"Looping..."], `typeSpeed={3}`, `deleteSpeed={1}`, `pauseAfterType={40}`,
`pauseAfterDelete={20}`, `loop`.

## Анимации

Таймлайн печать → пауза 40 → стирание 1 кадр/символ → пауза 20 для каждой
фразы; `loop` повторяет по модулю общей длительности; курсор мигает.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/typewriter/MultiTextTypewriter.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/multitext-typewriter.mdx` — документация

## Зависимости

`remotion-bits` (`TypeWriter`, `useViewportRect`); registry: `type-writer`.
Карточка компонента — `type-writer.md`.

## Совместимость и адаптация

`native`. Вынести фразы в props; длину сцены согласовать с суммой таймлайна,
чтобы ролик не обрывался посреди фразы. Задать фон и выравнивание.

## Паттерны

`comparison`, `sequence-steps`
