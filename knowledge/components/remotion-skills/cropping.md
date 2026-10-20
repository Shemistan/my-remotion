# Cropping — `remotion-skills/cropping`

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

Не рисует; документ об обрезке видимой области пропсами `cropLeft`,
`cropRight`, `cropTop`, `cropBottom` (доли 0..1).

## Когда использовать

Показать часть скриншота/видео, постепенно раскрыть кадр, сфокусироваться
на фрагменте. Поддерживают: `Sequence` с `layout="absolute-fill"`,
`Interactive.*`, компоненты `Interactive.create()`, `CanvasImage`, `Img`,
`AnimatedImage`, `HtmlInCanvas`, `Solid`, `Video`, `Gif`,
`RemotionRiveCanvas`.

## Фразы из озвучки

- «приблизимся к нужной части экрана»
- «обрежем всё лишнее»
- «кадр постепенно раскрывается»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

`cropLeft={interpolate(frame, [0, 30], [0, 0.25], {…clamp})}` и т.п.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/cropping.md`

## Зависимости

`remotion`, `@remotion/media`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

`key-point-emphasis`, `transformation`
