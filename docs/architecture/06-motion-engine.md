# 06. Движок сцен (Motion Engine)

Задача движка: из `MotionSpecification` получить детерминированную Remotion-сцену,
которую можно отрендерить, проверить и воспроизвести через месяц.

## 1. Слои

```text
MotionSpecification (JSON)          что и когда: биты, тексты, числа, режим, стиль
        │
StyleBible tokens                    цвета, шрифты, сетка, safe area, тени, easing-кривые
        │
motion-kit (проверенные примитивы)   frame-driven компоненты с provenance из KB
        │
Scene code (генерирует Engineer)     композиция из kit + адаптированный код из refs/
        │
render/ (Remotion 4.0.537)           бандл версии → stills → preview.mp4 → export
```

## 2. motion-kit

Небольшая собственная библиотека в `app/motion-studio/render/src/motion-kit/`.
Компоненты переписаны frame-driven по мотивам MIT-исходников из KB; у каждого —
ссылка на `kb_id`, commit и лицензию в `PROVENANCE.md`. Агент обязан предпочитать
kit, а код из refs/ адаптировать, только если в kit нет подходящего.

Минимальный состав Phase 1 (покрывает тесты 1–3 и паттерны quantities,
growth-decline, system-structure, key-point-emphasis):

| Примитив | Основа в KB | Нужен для |
|---|---|---|
| `useBeat(beat)` → `{ progress 0..1, phase: before/enter/hold/exit/after }` | — (своё) | синхронизация с битами |
| `AnimatedNumber` (tabular-nums, формат RU/EN, суффиксы «тыс.», «млн») | `remotion-bits/animated-counter`, `free-remotion-templates/kpi-counter` | тест 1 |
| `LineChart` / `AreaChart` (draw-on через `strokeDashoffset`, оси, подписи) | `free-remotion-templates/line-chart-anim`, `remotion-video-templates/ChartVideo` | тест 1 |
| `FlowGraph` (узлы-карточки + рёбра SVG-путями, ручная или простая слоистая раскладка) | `xyflow` (идея), `free-remotion-templates/logo-stroke-draw` (обводка) | тест 2 |
| `PulseAlongPath` (световой импульс по пути, `getPointAtLength`, хвост, glow) | `magicui/animated-beam` (adaptable → переписать на кадры) | тест 2 |
| `Card` с уровнем глубины (`elevation` 0–3: тени, блик, лёгкая перспектива) | `remotion-bits/Scene3D`, `free-remotion-templates/lower-third-glass-card` | тесты 2–3 |
| `KineticText` (по словам/буквам, разные входы) | `remotion-video-templates/KineticText`, `remotion-bits/AnimatedText` | заголовки |
| `Background` (градиент, виньетка, шум с `random(seed)`) | free-remotion-templates | все |

Каждый примитив проходит в Phase 1 реальный рендер; результат пишется в
`PROVENANCE.md` motion-kit (колонка `rendered`), а после появления БД (P1-03) — в
`component_tests`. Это первые `tested_status = rendered-ok` для соответствующих записей KB.

## 3. Правила детерминизма и движения

Источники: official skills 4.0.537 (`official_skills/skills/skills/remotion-markup/`) и
`templates/remotion-components/remotion-motion-graphics-skill/skills/remotion-motion-graphics/references/traps.md`
(карточки KB `remotion-motion-graphics-skill/*`), ТЗ §8.2.

- Анимация только от `useCurrentFrame()`; секунды → кадры через `fps` из `useVideoConfig()`.
- `interpolate(..., { extrapolateLeft: "clamp", extrapolateRight: "clamp" })` по умолчанию
  (в Remotion по умолчанию `extend`).
- `spring()` с явными `damping`, `mass`, `stiffness`; overshoot — осознанно, из StyleBible.
- Запрещены: CSS `transition`/`animation`, Tailwind `animate-*`/`transition-*`,
  `setTimeout`/`setInterval`/`requestAnimationFrame`, `Math.random`, `Date.now`,
  `useFrame` из R3F, хуки внутри `.map()`.
- Разные объекты сцены не входят одинаковым эффектом (ТЗ §8.2): Motion Director задаёт
  тип входа для каждого элемента в spec; Visual QA проверяет это по spec и кадрам.
- Случайность: `random(seed)` из Remotion.
- Шрифты загружаются через `@remotion/fonts` из локальных файлов `render/fonts/`
  (блокирует рендер до загрузки); `tabular-nums` в числах.
- Прозрачность: без фона на корне, `--image-format=png`, ProRes 4444
  `yuva444p10le` в `.mov` или VP9 `yuva420p` в `.webm`.
- WebGL/3D (`@remotion/three`) — не в Phase 1; при включении `--gl=angle`.

Правила проверяются статически (AST-проверка импорта и запрещённых API) до рендера.

## 4. StyleBible и пресеты

```ts
interface StyleBible {
  id: string; name: string;
  palette: { bg: string; surface: string; text: string; muted: string;
             accent: string[]; positive: string; negative: string };
  typography: { display: FontRef; body: FontRef; mono: FontRef;
                scale: number[]; tracking: Record<string, number> };
  grid: { columns: number; gutter: number; safe_area: { x: number; y: number } };
  surfaces: { radius: number[]; elevation: ShadowToken[] };
  motion: { intensity: "calm" | "balanced" | "energetic";
            easing: Record<"enter"|"exit"|"emphasis", [number, number, number, number]>;
            spring: Record<string, { damping: number; stiffness: number; mass: number }>;
            stagger_frames: number; enter_frames: number; exit_frames: number };
  camera: { allow_zoom: boolean; max_scale: number; parallax: boolean };
}
```

Phase 1 поставляет 3 пресета (`dark-premium`, `light-clean`, `tech-neon`) и
2–3 OFL-шрифта с кириллицей (например Inter, Manrope, JetBrains Mono — [Д] выбор
окончательный при реализации, проверка кириллицы и лицензии обязательна).
`animation_intensity` масштабирует амплитуды и длительности через токены, а не в коде сцены.

## 5. Сборка и рендер версии

1. Генерируется `MS_DATA_DIR/cache/entries/<sha256 файлов версии>/index.tsx`: `registerRoot` с одной
   `<Composition id="Scene">`, импортирующей `src/Scene.tsx` версии; `defaultProps` из
   `props.json`; размеры, fps, длительность из настроек; `schema` из Zod спецификации props.
2. `bundle()` с `webpackOverride`: алиасы только на файлы версии, `motion-kit` и
   зависимости render-пакета; неизвестный импорт → ошибка сборки.
3. `renderStill()` для 4–6 QA-кадров (`frames/`), затем `renderMedia()`:
   превью — H.264 CRF 23, 1/2 разрешения по умолчанию (настраивается); экспорт —
   полное разрешение, H.264 + AAC (тишина, если звука нет) в MP4; прозрачный экспорт —
   ProRes 4444 `.mov` (проверено: энкодеры есть в системе, Remotion несёт свой ffmpeg).
4. `ffprobe` результата: длительность (±1 кадр), размеры, fps, кодек → технический gate.
5. Логи браузера (`onBrowserLog`) сохраняются; любые сетевые запросы или ошибки
   консоли — warning/blocking в QA.

Бандлы кэшируются по sha256 содержимого файлов версии (`src/`, `props.json`) — ключ не
меняется при переносе draft → version, пересборка только при изменении содержимого.

## 6. Визуальный QA

Кадры: первый после входа, середина каждого бита, пик главного акцента, середина hold,
последний кадр. QA-агент получает PNG + spec + StyleBible и оценивает: обрезка и
выход за safe area, перекрытия, контраст и размер текста (дополнительно — простая
программная проверка контраста по палитре), соответствие смыслу и стилю.
Программные проверки без LLM: пустой кадр (однотонность), совпадение соседних
ключевых кадров (анимация «застыла»), размер файла превью.

Автоматический QA помечается как вспомогательный; итоговое решение — пользователь.

## 7. Сцены и паттерны (ТЗ §8.4) — покрытие по фазам

| Паттерн | Phase 1 kit | Позже |
|---|---|---|
| animated counters, growth charts | да | bar/race charts |
| process flows, network/architecture diagrams | да (FlowGraph + Pulse) | авто-раскладка (dagre/elk — [Д]) |
| kinetic typography, callouts | да | — |
| comparisons, timelines | через композицию kit | отдельные примитивы Ph4 |
| UI walkthroughs, code animations | нет | Ph4 (remotion-bits CodeBlock, мокапы) |
| conceptual metaphors, fullscreen explainers | Engineer строит из kit | шаблонизация лучших сцен Ph6 |
| overlay, PiP | нет (Playground — fullscreen) | Ph3–5 |
