# Motion blur — `remotion-skills/motion-blur`

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

Не рисует; документ о размытии движения `<HtmlInCanvasMotionBlur>` из
`@remotion/motion-blur` (с Remotion 4.0.529): контент снимается на дробных
кадрах, пиксели усредняются в canvas.

## Когда использовать

Быстрые пролёты, рывки, шлейф за движущимся объектом. Пропсы `width`,
`height` (обычно из `useVideoConfig()`), `shutterAngle` 0–360 (180),
`samples` 1–64 (8). `useCurrentFrame()` вызывать внутри ребёнка. Превью —
Chrome 149+ с `chrome://flags/#canvas-draw-element`; для рендера настройка не
нужна. Иначе — альтернативы в гайде по ссылке.

## Фразы из озвучки

- «стремительно пролетает мимо»
- «резкий рывок камеры»
- «скорость растёт»

## Визуальный стиль

Описываемый визуал — шлейф размытия по направлению движения.

## Входные данные

Нет (документ).

## Анимации

Временная выборка кадров с усреднением.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/motion-blur.md`
- https://www.remotion.dev/docs/motion-blur

## Зависимости

`@remotion/motion-blur`, `remotion`.

## Совместимость и адаптация

Нет; документ. Вложенность — только при `HtmlInCanvas.isNestingSupported()`.

## Паттерны

нет
