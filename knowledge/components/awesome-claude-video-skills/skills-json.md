# data/skills.json — `awesome-claude-video-skills/skills-json`

| Поле | Значение |
|---|---|
| Репозиторий | `awesome-claude-video-skills` (`templates/remotion-components/awesome-claude-video-skills`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | unknown |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | CC0 1.0 (LICENSE) на сам список; у каждого проекта своя |

## Что визуализирует

Не рисует; машиночитаемая копия каталога («Machine-readable copy» в конце
README).

## Когда использовать

Программная фильтрация внешних video-skills. Схема:

```json
{"generated": "2026-10-19", "source": "https://agentskillshub.top/best/claude-video-skills/",
 "kinds": [{"id": "general", "icon": "🧱", "en": "Frameworks & toolkits", "zh": "…"}],
 "skills": [{"repo_full_name": "…", "path": null, "stars": 0, "description": "…",
   "kind": "general", "security_grade": "safe", "language": "TypeScript", "license": "MIT"}]}
```

`kind` ∈ general, promo, explainer, editing, shorts, avatar, story, motion,
craft, music. `license` бывает `null` (например, `remotion-dev/skills`) и
`NOASSERTION`.

## Фразы из озвучки

- «подберём инструмент под жанр ролика»
- «только проекты с открытой лицензией»
- «самые популярные решения для монтажа»

## Визуальный стиль

Не применимо (JSON).

## Входные данные

Нет (документ).

## Анимации

Нет.

## Исходники и документация

- `templates/remotion-components/awesome-claude-video-skills/data/skills.json`
- `templates/remotion-components/awesome-claude-video-skills/README.md`

## Зависимости

Нет.

## Совместимость и адаптация

`unknown`: недостаточно данных — метаданные о внешних проектах, поле
совместимости с Remotion отсутствует.

## Паттерны

нет
