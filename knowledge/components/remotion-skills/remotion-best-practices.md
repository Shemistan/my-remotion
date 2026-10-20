# Skill remotion-best-practices — `remotion-skills/remotion-best-practices`

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

Не рисует; документ-маршрутизатор по всем skills Remotion 4.0.537: создание
видео, разметка, карты, мультимедиа, интерактивность, Studio, рендер,
субтитры, SaaS, поиск по докам, обновление.

## Когда использовать

Открыть первым, если неясно, какой skill нужен. Общие правила агента: не
перетирать правки пользователя; открывать Studio до сборки сцены (в Cursor —
`npx remotion studio`, со встроенным браузером — `--no-open`); рендерить
только по явной просьбе («Render», «Export», «Give me the MP4»).

## Фразы из озвучки

- «соберём ролик на Remotion с нуля»
- «сначала посмотрим превью, а потом отрендерим»
- «нужно короткое видео про продукт»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет; правила анимации — в `remotion-skills/remotion-markup`.

## Исходники и документация

- `official_skills/skills/skills/remotion-best-practices/SKILL.md` — сам skill
- `official_skills/skills/README.md` — список skills
- В `remotion-best-practices/<skill>/REFERENCE.md` и соседних файлах лежат
  копии остальных skills со связанными ссылками (зеркало каталогов
  `skills/<skill>/`).

## Зависимости

`remotion`, `@remotion/cli`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

нет
