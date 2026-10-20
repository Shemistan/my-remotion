# Basic Typewriter (bit) — `remotion-bits/basic-typewriter`

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

Одна фраза («Ah, those sunny days!») печатается по буквам крупным шрифтом
с мигающим курсором `|`, курсор продолжает мигать после окончания.

## Когда использовать

Простая «живая» подпись, заголовок-мысль, ввод в строку поиска. Несколько
фраз со стиранием — `multitext-typewriter`; опечатки и переменная скорость
— `variable-speed-typewriter`; терминал — `cli-simulation`.

## Фразы из озвучки

- «всё начинается с одной фразы»
- «просто введите то, что ищете»
- «напишем первую строчку»

## Визуальный стиль

Шрифт `8vmin`, цвет и гарнитура — наследуются от контейнера (не заданы).
150 кадров, 1920×1080.

## Входные данные

Без props: `text` зашит, `cursor={true}`, `style={{fontSize: vmin*8}}`;
остальное — значения `TypeWriter` по умолчанию (typeSpeed 3, blinkSpeed 30).

## Анимации

Печать 3 кадра/символ (21 символ ≈ 63 кадра) + пауза; мигание курсора по
кадру.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/typewriter/BasicTypewriter.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/basic-typewriter.mdx` — документация

## Зависимости

`remotion-bits` (`TypeWriter`, `useViewportRect`); registry: `type-writer`.
Карточка компонента — `type-writer.md`.

## Совместимость и адаптация

`native`. Вынести `text` в props, задать фон, цвет и центрирование
(сцена без обёртки — текст в левом верхнем углу).

## Паттерны

`key-point-emphasis`
