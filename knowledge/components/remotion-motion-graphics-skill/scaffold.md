# Scaffolding a Remotion project — `remotion-motion-graphics-skill/scaffold`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-motion-graphics-skill` (`templates/remotion-components/remotion-motion-graphics-skill`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, README) |

## Что визуализирует

Не рисует; документ о создании нейтральной рабочей базы Remotion для
моушн-графики.

## Когда использовать

Проекта нет. Шаги: `npx create-video@latest . --template blank` и
`npm install` (проверить, что запускается); добавить `zod`,
`@remotion/zod-types`, шрифтовые пакеты, `@remotion/transitions` на одной
версии с `remotion`; структура `src/Root.tsx`, `config.ts` (`CANVAS`
1920×1080@30, `sec()`, `SAFE_MARGIN = 0.05`), `tokens.ts`, `fonts.ts`,
`compositions/`, `public/`, `out/` в `.gitignore`; четыре минимальные
композиции — `TitleCard`, `LowerThird`, `KineticText`, `BadgeOverlay`
(без фона); скрипты `studio`/`render`/`typecheck`/`upgrade`; README.

## Фразы из озвучки

- «подготовим проект для оверлеев канала»
- «плашки для подкаста»
- «набор заставок в одном стиле»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет; стартовые композиции описаны словами (код — только BadgeOverlay в
`patterns.md`).

## Исходники и документация

- `templates/remotion-components/remotion-motion-graphics-skill/skills/remotion-motion-graphics/references/scaffold.md`

## Зависимости

`create-video`, `remotion`, `zod`, `@remotion/zod-types`,
`@remotion/google-fonts`/`@remotion/fonts`, `@remotion/transitions`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

нет
