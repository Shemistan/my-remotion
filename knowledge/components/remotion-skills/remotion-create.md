# Skill remotion-create — `remotion-skills/remotion-create`

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

Не рисует; документ о создании проекта и первой композиции Remotion.

## Когда использовать

Проекта ещё нет или начинается новая композиция. Пустая папка (кроме
`.DS_Store`) — scaffold прямо в ней; непустая — в подпапке. Скрытые `.env`,
`.git` не удалять. Сразу после установки — открыть Studio. Дальше: правила
разметки (`remotion-markup`), вёрстка кадра (`video-layout`), композиции,
монтаж клипов, многосценные ролики, Tailwind по запросу.

## Фразы из озвучки

- «начнём новый ролик»
- «сделаем промо для магазина пластинок»
- «создадим первую сцену»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет; отсылает к `remotion-skills/remotion-markup`.

## Исходники и документация

- `official_skills/skills/skills/remotion-create/SKILL.md`
- `official_skills/skills/skills/remotion-best-practices/remotion-create/REFERENCE.md` — копия со ссылками

```bash
npx create-video@latest --yes --blank --no-tailwind my-video
```

## Зависимости

`create-video`, `remotion`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

нет
