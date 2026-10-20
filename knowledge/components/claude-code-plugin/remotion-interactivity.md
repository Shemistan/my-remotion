# Plugin skill remotion-interactivity — `claude-code-plugin/remotion-interactivity`

| Поле | Значение |
|---|---|
| Репозиторий | `claude-code-plugin` (`official_skills/claude-code-plugin`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (`.claude-plugin/plugin.json`; файла LICENSE нет) |

## Что визуализирует

Не рисует; документ о разметке, редактируемой в Studio, и морфинге SVG
(`Interactive.Path` + `interpolatePaths`).

## Когда использовать

Ролик будут править в Studio. Подробно —
`remotion-skills/remotion-interactivity`, `remotion-skills/timeline-structure`,
`remotion-skills/inline-effects`.

## Фразы из озвучки

- «треугольник превращается в стрелку»
- «поправим текст прямо в редакторе»
- «фигура меняет форму»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

`interpolatePaths`, inline `interpolate`.

## Исходники и документация

- `official_skills/claude-code-plugin/skills/remotion-interactivity/SKILL.md`

## Зависимости

`remotion`, `@remotion/paths`.

## Совместимость и адаптация

Нет; документ. Зеркало `remotion-skills/remotion-interactivity`.

## Паттерны

`transformation`
