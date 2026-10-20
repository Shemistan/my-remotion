# HtmlInCanvas — `remotion-skills/html-in-canvas`

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

Не рисует; документ о `<HtmlInCanvas>`: дети рендерятся в `<canvas>` для
пост-обработки Canvas 2D или WebGL.

## Когда использовать

Эффект на группу HTML-элементов целиком, когда у них нет пропа `effects`.
Только Chrome 149+ с флагом canvas-draw-element — предупредить пользователя.
Вложенность — при `HtmlInCanvas.isNestingSupported()` (Chrome 157+). WebGL
при рендере — `--gl=angle` или `Config.setChromiumOpenGlRenderer("angle")`.

## Фразы из озвучки

- «вся сцена плывёт и размывается»
- «эффект старого телевизора на всём кадре»
- «картинка искажается как в глитче»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

`onPaint({canvas, elementImage})` + `ctx.drawElementImage`; пример — blur,
пульсирующий по `Math.sin(frame / fps * PI)`; WebGL-вариант.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/html-in-canvas.md`

## Зависимости

`remotion`.

## Совместимость и адаптация

Нет; документ. Ограничение — экспериментальный флаг браузера.

## Паттерны

нет
