# 3D Terminal (bit) — `remotion-bits/bit-terminal-3d`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `ui-mockups` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Три окна терминала в стиле macOS (три цветные точки, заголовок) в 3D:
`git status`, логи сервера, процесс сборки. В окнах печатается вывод,
окна слегка покачиваются, камера перелетает от одного к другому.

## Когда использовать

Рассказ о разработке, деплое, DevOps, «всё запускается одной командой»,
параллельные процессы. Для одного окна без 3D — `cli-simulation`; для
кода с подсветкой — `code-block`.

## Фразы из озвучки

- «запускаем сборку — и через минуту всё готово»
- «сервер поднялся, база подключена»
- «пока идёт деплой, смотрим логи»

## Визуальный стиль

Окна 40 % ширины × 50 % высоты, фон `var(--color-surface-dark)`, шапка
`var(--color-surface-light)`, рамка `var(--color-border-light)`,
моноширинный шрифт, цветной prompt; 300 кадров, 1920×1080.

## Входные данные

Без props: заголовки и тексты окон зашиты. Внутренний `TerminalWindow`
`{title, children, width, height, style?}`. Шаги: main (центр), side (x
0.8·ширины, z 150, `rotateY` −45), top (x 0.8w, y −0.8h).

## Анимации

`Scene3D` (`transitionDuration` 40, `stepDuration` 60, `easeInOutCubic`);
каждое окно в `StaggeredMotion` качается `rotateX/Y` ±5° за 100–120 кадров;
вывод — `TypeWriter` (`typeSpeed` 1–2, курсор во 2–3 окне).

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/scene-3d/Terminal3D.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/terminal-3d.mdx` — документация

## Зависимости

`remotion-bits` (`Scene3D`, `Step`, `TypeWriter`, `StaggeredMotion`,
`useViewportRect`); registry указывает только `scene-3d`. См.
`remotion-bits/scene-3d`, `remotion-bits/type-writer`.

## Совместимость и адаптация

`native`. `TypeWriter` не учитывает вход шага — печать во всех окнах
стартует с кадра 0, к прилёту камеры в side/top текст уже частично набран;
для синхронности задать `delay` = enterFrame шага (60, 120). Определить
CSS-переменные; эмодзи «✨» зависит от системного шрифта.

## Паттерны

`sequence-steps`, `system-structure`, `spatial`
