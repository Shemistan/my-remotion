# Skill remotion-interactivity — `remotion-skills/remotion-interactivity`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-skills` (`official_skills/skills`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | не указана (нет LICENSE, нет поля license в package.json) |

## Что визуализирует

Не рисует; документ о разметке, которую можно править в Remotion Studio, и
о редактируемых SVG-путях с морфингом.

## Когда использовать

Пользователь будет менять тексты, цвета, ключи и пути в Studio; нужен
морфинг фигур. Правила: поля `InteractivitySchema` (`string`, `number`,
`color`, `enum`, `asset`, `font-family`, `translate`, `svg-path`,
`remotion-captions`…; у каждого `default`, `description`); готовые фрагменты
`Interactive.textSchema`, `backgroundSchema`, `borderRadiusSchema`,
`childrenSchema`; `Interactive.Div` с литеральным `name`; стили inline без
констант, спреда и математики; `interpolate` inline (в диапазоне допустимы
`fps`, `durationInFrames`, `2 * fps`, `durationInFrames - 1`); `scale`/
`translate`/`rotate` вместо `transform`; inline-метаданные `Composition`.

## Фразы из озвучки

- «треугольник превращается в стрелку»
- «поправим текст прямо в редакторе»
- «фигура меняет форму»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

`<Interactive.Path d={interpolatePaths(frame, [0, 30, 60], [pathA, pathB, pathC], {easing, clamp})}>`
— морфинг; прорисовка контура `strokeDasharray`/`strokeDashoffset`.

## Исходники и документация

- `official_skills/skills/skills/remotion-interactivity/SKILL.md`
- https://www.remotion.dev/docs/interactivity-schema

## Зависимости

`remotion`, `@remotion/paths`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

`transformation`
