## Контракт сцены (проверяется до рендера)

**`props.json`** проходит `ScenePropsBaseSchema` (`@ms/contracts`) — ровно три поля, без
лишних:

```json
{
  "timing": { "duration_frames": 180, "beats": [{ "id": "title", "start_frame": 0, "end_frame": 36 }] },
  "style": { "preset": "dark-premium", "intensity": "balanced", "depth": 1, "transparent": false, "safe_area": { "x": 0.05, "y": 0.05 } },
  "content": { "title": "…", "points": [] }
}
```

- `timing` — `duration_frames` ровно как в `settings.json` и `spec.json`; `beats` — биты
  spec (`id`, `start_frame`, `end_frame`) **все и как в spec**. Сцена берёт тайминги
  **только** из `props.timing.beats` (по `id`), не из чисел в коде: правки «медленнее на
  25 %» меняют props, а не код.
- `style` — из настроек: `preset` = `settings.style_preset`, `intensity` =
  `settings.animation_intensity`, `transparent` = `settings.transparent_export`,
  `safe_area` = `settings.safe_area`, `depth` 1 (`font` — только если задан в настройках).
  Пайплайн всё равно перезапишет эти поля из настроек; `palette_overrides` и `depth` он
  сохраняет. Свои цвета — через `palette_overrides` (ключи `bg surface text muted accent[]
  positive negative`), а не числами в коде.
- `content` — все тексты, числа и данные сцены (то, что Engineer берёт из spec дословно).
  Код читает их из `props.content`, а не держит строками в JSX.

**Стиль — только через StyleBible.** Корень сцены — `<StyleProvider style={props.style}>`;
внутри — `useStyle()` (это `resolveStyle(props.style)` под fps композиции). Цвета, кегли,
радиусы, тени, кривые и длительности — токены стиля (`palette`, `typeSize`, `radius`,
`shadow`, `motion.*`), не числа «с потолка».

**Прозрачный экспорт.** При `props.style.transparent = true` на корне нет фона: ни
`<Background>`, ни заливки `AbsoluteFill`/`div` на весь кадр. При `false` фон покрывает
весь кадр на каждом кадре.

**Импорт — только allowlist:** `react`, `remotion`, `@remotion/fonts`, `@ms/motion-kit` и
локальные файлы `src/`. Никаких `framer-motion`, `gsap`, `d3`, `lodash`, `three` и т. п.

**Предпочитай motion-kit.** Компоненты kit детерминированы, проверены рендером и уже
держат стиль, шрифты, тени, easing и правило соседей. Своё — только если в kit нет
подходящего, и тоже на токенах стиля.

**Код из `refs/kb` — адаптировать на кадры.** Исходники KB написаны для браузера (CSS
transitions, `useState`, таймеры, framer-motion, `getBoundingClientRect`). Бери идею и
геометрию, переписывай на кадры: состояние — функция от `useCurrentFrame()`. Копировать
как есть нельзя. Каждый `kb_id`, чей код или идею ты использовал, — в `kb_ids_used`
отчёта, и только из `knowledge-refs.json`.

**Детерминизм.** Всё движение — от `useCurrentFrame()`; `interpolate` всегда с
`{ extrapolateLeft: "clamp", extrapolateRight: "clamp" }`. Запрещены CSS
`transition`/`animation`/`@keyframes`, `<style>`, `setTimeout`/`setInterval`/
`requestAnimationFrame`, `Math.random`, `Date.now`/`new Date()`/`performance`, `fetch`,
внешние URL, `window`/`document`/`process`, `dangerouslySetInnerHTML`, `eval`,
`staticFile()` и `/proxy`. Случайность — `random("seed")` из `remotion`.
