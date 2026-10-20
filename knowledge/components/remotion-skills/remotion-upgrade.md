# Skill remotion-upgrade — `remotion-skills/remotion-upgrade`

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

Не рисует; документ об обновлении Remotion и связанных пакетов.

## Когда использовать

Ошибки из-за разных версий `@remotion/*`, или нужен новый API. С локальным
`@remotion/cli` — `npx remotion upgrade` (обновляет и skills). Без него —
вручную: все `remotion`/`@remotion/*` на `npm view remotion version`,
`zod`/`mediabunny`/`@huggingface/transformers` по зависимостям
`@remotion/studio`, `npx skills update …`, проверка `npx remotion versions`.

## Фразы из озвучки

- «обновим проект до свежей версии»
- «все пакеты на одной версии»
- «починим несовместимость»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет.

## Исходники и документация

- `official_skills/skills/skills/remotion-upgrade/SKILL.md`

## Зависимости

`@remotion/cli`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

нет
