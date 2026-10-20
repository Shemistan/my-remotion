# Inline effects — `remotion-skills/inline-effects`

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

Не рисует; документ о записи массива `effects` inline, чтобы эффекты и их
ключи редактировались в Studio.

## Когда использовать

При добавлении эффектов в редактируемые композиции: массив не вычислять,
параметры, диапазоны, easing, extrapolation и `output` — захардкожены, по
тем же правилам, что `interpolate()`. Пример — `radialProgressiveBlur` на
`CanvasImage`.

## Фразы из озвучки

- «фокус смещается к центру»
- «кадр размывается по краям»
- «мягкий блюр фона»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Ключи параметров эффекта inline-`interpolate`.

## Исходники и документация

- `official_skills/skills/skills/remotion-interactivity/inline-effects.md`
- каталог эффектов — `remotion-skills/effects`

## Зависимости

`@remotion/effects`, `remotion`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

нет
