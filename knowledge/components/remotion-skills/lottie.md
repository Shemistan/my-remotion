# Lottie animations — `remotion-skills/lottie`

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

Не рисует; документ о проигрывании Lottie-анимаций покадрово через
`@remotion/lottie`.

## Когда использовать

Есть готовая Lottie (иконка, иллюстрация, персонаж). Порядок: загрузить JSON
под `delayRender()` → сохранить в state → `continueRender()` → рендер
`<Lottie animationData>`; ошибки — `cancelRender`.

## Фразы из озвучки

- «анимированная иконка подтверждает успех»
- «маленький персонаж машет рукой»
- «галочка — всё готово»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Lottie, синхронизированная с кадром Remotion.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/lottie.md`

## Зависимости

`@remotion/lottie`, `remotion`.

## Совместимость и адаптация

Нет; документ. Рецепт для компонентов на `lottie-web`/`lottie-react` с
автоплеем.

## Паттерны

нет
