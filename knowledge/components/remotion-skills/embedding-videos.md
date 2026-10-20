# Embedding videos — `remotion-skills/embedding-videos`

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

Не рисует; документ о `<Video>` из `@remotion/media`.

## Когда использовать

В кадре запись экрана, демо, футаж. Возможности: `staticFile()` или
удалённый URL; `trimBefore`/`durationInFrames`; `from` для задержки; размер и
позиция через `style` + `objectFit`; `volume` числом или `interpolate` по
кадру; `muted`; `playbackRate` (реверс не поддерживается); `loop`;
`toneFrequency` 0.01–2 (только серверный рендер, не Studio/Player).

## Фразы из озвучки

- «посмотрите на запись экрана»
- «вставим фрагмент демо»
- «замедлим этот момент»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Громкость по ключам, скорость, цикл.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/embedding-videos.md`

## Зависимости

`@remotion/media`, `remotion`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

нет
