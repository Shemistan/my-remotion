# Title (legacy) — `remotion-boilerplate/word-spring-title`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-boilerplate` (`templates/remotion-components/remotion-boilerplate`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | UNLICENSED (package.json, README); файла LICENSE нет — только референс идей |

## Что визуализирует

Заголовок внизу кадра, слова которого по очереди вырастают из нуля
(`scale` 0→1) с шагом 5 кадров — компонент из стандартного стартового
шаблона Remotion (README: «Legacy word-level spring»).

## Когда использовать

Референс простейшего пословного появления заголовка. В композициях не
используется.

## Фразы из озвучки

- «три слова, которые всё объясняют»
- «итак, начнём»
- «запомните это»

## Визуальный стиль

100 px bold, `SF Pro Text, Helvetica, Arial`, цвет из props, `bottom: 160`.

## Входные данные

`titleText: string`, `titleColor: string` (оба обязательны).

## Анимации

`spring({frame: frame - i*5, config: {damping: 200}})` на слово → `scale`.

## Исходники и документация

- `templates/remotion-components/remotion-boilerplate/src/components/text/Title.tsx`

## Зависимости

`remotion`.

## Совместимость и адаптация

`native`. `key={t}` — повторяющиеся слова дадут конфликт ключей.
UNLICENSED: без явной лицензии переиспользование кода юридически не
разрешено — только как референс идей (сам приём есть в официальном
шаблоне Remotion).

## Паттерны

`key-point-emphasis`
