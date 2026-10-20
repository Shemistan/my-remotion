# Skill remotion-captions — `remotion-skills/remotion-captions`

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

Не рисует; документ-оглавление по субтитрам.

## Когда использовать

Нужны субтитры или подсветка слов. Все субтитры — JSON типа `Caption` из
`@remotion/captions`:

```ts
type Caption = { text: string; startMs: number; endMs: number;
  timestampMs: number | null; confidence: number | null; pageBreakAfter?: boolean };
```

Дальше: транскрибация (`transcribe-captions`), показ (`display-captions`),
импорт `.srt` (`import-srt-captions`).

## Фразы из озвучки

- «субтитры под каждой фразой»
- «слова подсвечиваются по мере речи»
- «добавим титры для просмотра без звука»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет; см. `remotion-skills/display-captions`.

## Исходники и документация

- `official_skills/skills/skills/remotion-captions/SKILL.md`

## Зависимости

`@remotion/captions`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

нет
