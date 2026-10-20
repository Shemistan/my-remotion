# Magic UI skill для агентов — `magicui/magic-ui-skill`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | unsuitable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Ничего: это skill-инструкция (`SKILL.md` + `references/`) для
AI-агентов о том, как подбирать, устанавливать (`npx shadcn@latest add
@magicui/<slug>`) и встраивать компоненты Magic UI в React/Next.js.

## Когда использовать

Агенту-разработчику при переносе компонента Magic UI в Remotion-проект:
команды установки, обязательные keyframes/зависимости, эвристики
выбора («одна главная визуальная опора на hero»), рецепты секций.
Про покадровый рендер и Remotion в нём ничего нет — правила адаптации
брать из `compatibility/magicui.md`.

## Фразы из озвучки

- (не для озвучки) «как поставить компонент Magic UI»
- (не для озвучки) «какие keyframes нужны компоненту»
- (не для озвучки) «рецепт hero-секции из Magic UI»

## Визуальный стиль

Не применимо.

## Входные данные

Не применимо. Структура: `SKILL.md` (frontmatter `name: magic-ui`,
workflow из 5 шагов, эвристики, troubleshooting),
`references/components.md` (семейства компонентов, install contract),
`references/recipes.md` (рецепты секций: hero, …).

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/magicui/skills/magic-ui/SKILL.md` — skill
- `templates/react-libriry/magicui/skills/magic-ui/references/components.md` — справочник семейств
- `templates/react-libriry/magicui/skills/magic-ui/references/recipes.md` — рецепты секций

## Зависимости

shadcn CLI, Tailwind, React/Next.js (как предпосылки, описанные в тексте).

## Совместимость и адаптация

`unsuitable` как визуальный элемент (это документ). Полезен как
справка; учитывать, что `references/components.md` упоминает
`light-rays`, отсутствующий в корневом `registry.json`, но
присутствующий в `apps/www/registry/registry-ui.ts`.

## Паттерны

нет
