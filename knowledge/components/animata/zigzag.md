# ZigZag — `animata/zigzag`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Статичный фон-узор «зигзаг/ёлочка» из четырёх наложенных
`linear-gradient` под 45/135/225/315°.

## Когда использовать

Игривая, «ретро» подложка, рамка для акцентного блока. Для делового тона
лучше `animata/grid` или `animata/dot`.

## Фразы из озвучки

- «путь был непрямым»
- «взлёты и падения»
- «немного хаоса для настроения»

## Визуальный стиль

Серый `#cacaca` на `bg-background`, ячейка `2 × size` (20px по умолчанию).

## Входные данные

`color = "#cacaca"`, `size = 10` (px), `children?` (без них — заглушка),
`className?`.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/background/zigzag.tsx` — компонент
- `templates/react-libriry/animata/content/docs/background/zigzag.mdx` — документация
- `templates/react-libriry/animata/animata/background/zigzag.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`); `bg-background` из темы.

## Совместимость и адаптация

`adaptable` без доработки; при желании сдвигать `background-position` по
кадру. Задать `--background` или явный цвет.

## Паттерны

`abstract-concepts`
