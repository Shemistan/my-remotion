# Color correction — `remotion-skills/color-correction`

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

Не рисует; документ о цветокоррекции футажа через `effects`.

## Когда использовать

Сделать кадр теплее/холоднее, ярче, контрастнее, обесцветить, применить
цветовой грейд. `colorCorrection()` — один WebGL-проход с контролами Studio:
`exposure` (−5..5), `temperature`, `tint`, `shadows`/`highlights`,
`blacks`/`whites` (−1..1), `contrast` (около `pivot`), `saturation` (0 —
ч/б), `vibrance`. `lut()` — 3D `.cube`.

## Фразы из озвучки

- «теплее, как на закате»
- «вспомним, как это было — кадр выцветает»
- «сделаем картинку чёрно-белой»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Параметры коррекции, меняющиеся по кадру.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/color-correction.md`
- https://www.remotion.dev/docs/effects/color-correction

## Зависимости

`@remotion/effects`, `@remotion/media`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

`transformation`
