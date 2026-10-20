# Timing props — `remotion-skills/timing-props`

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

Не рисует; документ о пропсах `from`, `trimBefore`, `durationInFrames`,
`playbackRate`, `loop` у встроенных компонентов (`AbsoluteFill`,
`Interactive.*`, `Img`, `AnimatedImage`, `CanvasImage`, `HtmlInCanvas`,
`Solid`, `Sequence`, `Track`, `Video`, `Audio`, `Gif`…).

## Когда использовать

Сдвинуть по времени, обрезать начало, ограничить длительность,
ускорить/замедлить, зациклить. Порядок: from → trimBefore →
durationInFrames → playbackRate → loop. Кадр детей:
`trimBefore + (frame - from) * playbackRate`. Компонент без этих пропсов —
обернуть в `Sequence` (`layout="absolute-fill"` или `"none"`).

## Фразы из озвучки

- «ускорим этот момент вдвое»
- «покажем фрагмент со второй по пятую секунду»
- «анимация повторяется по кругу»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Сдвиг, обрезка, скорость, цикл. `Img`, `CanvasImage`, `Solid` и shapes не
поддерживают `loop`.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/timing-props.md`
- https://www.remotion.dev/docs/timing

## Зависимости

`remotion`, `@remotion/media`, `@remotion/gif`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

`timeline`, `sequence-steps`
