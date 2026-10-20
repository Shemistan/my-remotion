# SecurityAlert — `animata/security-alert`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Чёрный виджет 208×208 тревоги безопасности: полоса-«лента» сверху,
«Security at risk», крупное число «139,532», «30m ago» и кнопка «Quick
scan», внизу пульсирующая красным плашка «⚠ 2 items».

## Когда использовать

Киберугрозы, инцидент, «обнаружены уязвимости», срочное предупреждение.

## Фразы из озвучки

- «обнаружено две угрозы»
- «ваши данные под угрозой»
- «нужно срочно запустить проверку»

## Визуальный стиль

zinc-950, диагональная штриховка `bg-striped` (из `@theme`), красное
мигающее свечение; тревожно.

## Входные данные

`className?`, `title = "Security at risk"`, `riskValue = "139,532"`,
`timeAgo = "30m"`, `scanLabel = "Quick scan"`, `issueCount = 2`.

## Анимации

Tailwind `animate-blink-red` (`blink-red 2s infinite linear`: фон и
box-shadow красного 0.5↔1), keyframes в `styles/globals.css`.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/security-alert.tsx` — виджет
- `templates/react-libriry/animata/styles/globals.css` — `blink-red`, `bg-striped`
- `templates/react-libriry/animata/content/docs/widget/security-alert.mdx` — документация
- `templates/react-libriry/animata/animata/widget/security-alert.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils`, токены темы.

## Совместимость и адаптация

`adaptable`: заменить `animate-blink-red` на inline `boxShadow`/
`backgroundColor` с альфой из `interpolate(frame % (2*fps), [0, fps,
2*fps], [0.5, 1, 0.5])`; `bg-striped` определить в своём CSS или inline.

## Паттерны

`key-point-emphasis`, `cause-effect`
