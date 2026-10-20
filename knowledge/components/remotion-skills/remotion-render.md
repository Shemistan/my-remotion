# Skill remotion-render — `remotion-skills/remotion-render`

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

Не рисует; документ о рендере видео и кадров.

## Когда использовать

Явная просьба экспортировать, либо проверка ключевых кадров картинками:

```
npx remotion render [composition-id] out/frames --frames=0,30,90 --image-format=png
```

Видео — `npx remotion render`, кадр — `npx remotion still`; прозрачность —
`remotion-skills/transparent-videos`.

## Фразы из озвучки

- «экспортируем готовый ролик»
- «проверим пару кадров»
- «сохраним обложку»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет.

## Исходники и документация

- `official_skills/skills/skills/remotion-render/SKILL.md`
- https://www.remotion.dev/docs/cli/render.md, https://www.remotion.dev/docs/cli/still.md

## Зависимости

`@remotion/cli`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

нет
