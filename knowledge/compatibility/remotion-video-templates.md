# remotion-video-templates — совместимость с Remotion

Репозиторий `templates/remotion-components/remotion-video-templates`
(AleBrito124356), `license: MIT` в `package.json` и `LICENSE` (© 2026
Alejandro Brito). Ограничений нет, при копировании сохранить MIT-уведомление.
Шрифт Inter (через `@remotion/google-fonts`) — OFL. Сам Remotion лицензируется
отдельно (company license для крупных команд).

## Стек

Remotion 4.0.200, React 18.3, `@remotion/transitions`, `@remotion/google-fonts`,
`@remotion/zod-types`, zod 3.22. Семь композиций в `src/Root.tsx`, у шести —
`calculateMetadata`, длительность выводится из props той же функцией, что
раскладывает таймлайн в компоненте. Все props описаны zod-схемами (`zColor`
для цветов) → форма в Studio.

## Общий механизм анимации

Всё — чистые функции кадра: `useCurrentFrame` + `spring` (пресеты
`SNAPPY/GENTLE/BOUNCE` из `src/lib/springs.ts`) + `interpolate`.
Случайность — `random(seed)` (LogoIntro). Структура времени: `Sequence`
(KineticText), `Series` (LowerThirds), `TransitionSeries` со `slide`/`fade`
(PromoTemplate). CSS-анимаций, таймеров, rAF, DOM-измерений нет. SVG — только
LineChart (draw-on через `pathLength` + `strokeDashoffset`).

Итог: все 15 записей `native`.

## Ассеты

`public/logo.svg`, `public/screenshot-1.svg`, `public/screenshot-2.svg`
(по README) — через `staticFile`; `public/captions.sample.json` —
импортируется как JSON при сборке для дефолтных субтитров.

## Типовые адаптации

- Шрифт тянется с Google Fonts при рендере (`external-service`); для
  кириллицы добавить subset `cyrillic` в `src/lib/fonts.ts`.
- Размеры (шрифты, отступы) в px под 1920×1080 — для других разрешений
  масштабировать.
- `CaptionedShort` не подключает аудио — добавить `<Audio>`.
- `LowerThirds` — демо трёх стилей подряд; для монтажа брать один стиль
  из `styles.tsx`.
- Длительности сцен PromoTemplate — константы модуля, не props.

## Что пропущено

- `remotion.config.ts` (настройки рендера: jpeg, h264, concurrency) и
  `.github/workflows/render.yml` — не визуальные; CI-файл не читался.
- Внутренние подкомпоненты шаблонов (`Particles`, `Line`, `HookScene`,
  `FeatureScene`, `CtaScene`, `StageBackground`) описаны в карточках шаблонов,
  отдельных записей нет — они не экспортируются.

## Чего не удалось выяснить

- Каталог нельзя было пролистать `ls`/`find` (Bash вне worktree запрещён
  режимом dontAsk): файлы найдены по импортам и дереву из README. Файлы,
  которые нигде не импортируются и не упомянуты в README, могли остаться
  незамеченными.
- `public/screenshot-2.svg` и `.env.example` не открывались (упомянуты в README).
- Рендер не выполнялся — `verification: static-review`.
