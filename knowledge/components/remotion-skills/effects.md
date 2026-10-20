# Effects — `remotion-skills/effects`

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

Не рисует; документ об эффектах через проп `effects` и каталог
`@remotion/effects`.

## Когда использовать

Нужен визуальный эффект: свечение, виньетка, засветка, глитч, полутон,
пикселизация, цветокор. `effects` принимают `Img`, `CanvasImage`,
`AnimatedImage`, `Solid`, `HtmlInCanvas`, `Video`, `Gif`,
`RemotionRiveCanvas` и фигуры `@remotion/shapes`; обычный HTML — через
обёртку `HtmlInCanvas`.

## Фразы из озвучки

- «добавим мягкое свечение»
- «виньетка фокусирует внимание на центре»
- «кадр рассыпается на пиксели»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Группы встроенных эффектов: цвет и тон; блюр и шлейфы (`blur`,
`lightTrail`, `zoomBlur`…); свет (`glow`, `lightLeak`, `shine`,
`starburst`, `vignette`, `dropShadow`); искажения (`chromaticAberration`,
`fisheye`, `wave`, `cornerPin`…); текстуры (`halftone`, `scanlines`,
`noise`, `paper`, `dotGrid`…); края (`outline`, `tear`…); пикселизация и
переходы (`pixelate`, `pixelDissolve`, `venetianBlinds`, `evolve`…). Свой
эффект — `createEffect({type, label, documentationLink, backend: '2d'|'webgl2'|'webgpu', calculateKey, setup, apply, cleanup, schema, validateParams})`.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/effects.md`
- https://www.remotion.dev/docs/effects, https://www.remotion.dev/docs/create-effect

## Зависимости

`@remotion/effects`, `remotion`.

## Совместимость и адаптация

Нет; документ. Большинство — WebGL2, `cylinder()`/`sphere()`/`pageTurn()` —
WebGPU; при рендере `Config.setChromiumOpenGlRenderer('angle')`.

## Паттерны

`key-point-emphasis`
