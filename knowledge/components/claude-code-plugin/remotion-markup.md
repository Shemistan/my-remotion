# Plugin skill remotion-markup — `claude-code-plugin/remotion-markup`

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

Не рисует; главный документ о разметке Remotion с оглавлением тематических
правил (тайминг, последовательности, переходы, видео, звук, эффекты, motion
blur, HtmlInCanvas, 3D, шрифты, GIF, Lottie, субтитры, композиции, монтаж).

## Когда использовать

Любая сцена при работе через плагин. Каждое правило описано отдельной
записью: `remotion-skills/timing`, `remotion-skills/transitions`,
`remotion-skills/audio`, `remotion-skills/3d`, `remotion-skills/effects`,
`remotion-skills/text-highlights` и др.

## Фразы из озвучки

- «заголовок плавно появляется»
- «переходим к следующей теме»
- «добавим фоновое видео и музыку»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

`interpolate` + clamp, `Easing.bezier/spring`, perceptual-scale,
`TransitionSeries`, `effects`.

## Исходники и документация

- `official_skills/claude-code-plugin/skills/remotion-markup/SKILL.md`
- `official_skills/claude-code-plugin/skills/remotion-markup/timing.md` (и остальные файлы правил рядом)
- `official_skills/claude-code-plugin/skills/remotion-best-practices/remotion-markup/timing.md` — зеркало в маршрутизаторе

## Зависимости

`remotion`, `@remotion/media`, `@remotion/effects`, `@remotion/transitions`.

## Совместимость и адаптация

Нет; документ. Зеркало `remotion-skills/remotion-markup`.

## Паттерны

нет
