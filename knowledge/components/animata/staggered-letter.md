# StaggeredLetter — `animata/staggered-letter`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Буквы слова по одной падают сверху (−150px) или вылетают снизу (+150px) на
серую «маску»-подложку того же слова, и закрывают её.

## Когда использовать

Заставка, логотип, название, которое «собирается» буквами. В доках
`published: false`, но компонент и story есть.

## Фразы из озвучки

- «встречайте»
- «название, которое запомнится»
- «собираем по буквам»

## Визуальный стиль

`text-7xl font-bold drop-shadow-lg`; подложка `text-gray-400`.

## Входные данные

`text?` (`"Animata"`), `delay?` (0.09, секунд между буквами), `direction?:
"up" | "drop"` (`"drop"`), `applyMask?` (true), `className?`, атрибуты `div`.

## Анимации

`motion.div` на букву: `initial {opacity 0, y ±150}` → `animate {opacity 1,
y 0}`, `delay: index*delay`, переход motion по умолчанию. Ключи по букве —
повторы букв дают коллизии ключей.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/staggered-letter.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/staggered-letter.mdx` — документация (published: false)
- `templates/react-libriry/animata/animata/text/staggered-letter.stories.tsx` — пример

## Зависимости

`motion`, `@/lib/utils`.

## Совместимость и адаптация

Только вход → `spring({frame: frame − i·delay·fps, fps})` для y/opacity;
ключи заменить на индекс.

## Паттерны

`key-point-emphasis`, `sequence-steps`
