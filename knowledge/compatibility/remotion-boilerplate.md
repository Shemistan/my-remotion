# remotion-boilerplate — совместимость с Remotion

Репозиторий `templates/remotion-components/remotion-boilerplate`
(gorillabiscuit, «Cerebral Animation tech series»).

## Лицензия и ограничения

`"license": "UNLICENSED"` в `package.json`, в README «UNLICENSED — private
project», файла `LICENSE` нет. **Без явной лицензии переиспользование кода
юридически не разрешено — только как референс идей.** Все записи помечены
этим в `license`/`adaptations`; класс `remotion_compat` отражает только
технику. Почти все приёмы повторимы на MIT-коде: `remotion-bits`
(`AnimatedText`, `StaggeredMotion`), официальные `@remotion/transitions`,
`@remotion/motion-blur`; логотип-атом — вариант стандартного шаблона Remotion.

## Стек

Remotion 4.0.434, React 19.2, TypeScript 5.9, `@remotion/transitions`
(`clockWipe`), `@remotion/motion-blur` (`CameraMotionBlur`, `Trail`),
`@remotion/zod-types`, zod 4.3, `remotion-bits` ^0.1.14, Tailwind v4 через
`@remotion/tailwind-v4` (`remotion.config.ts` → `enableTailwind`,
`src/index.css` → `@import "tailwindcss"`). В прочитанных компонентах
Tailwind-классы не используются — всё inline-стилями.
`culori` есть в зависимостях, но ни в одном прочитанном файле не импортируется.

Композиции: `Main` (150 кадров, TransitionSeries title → clockWipe →
features) и `OnlyLogo` (150 кадров).

## Общий механизм анимации

Текст — `AnimatedText` из `remotion-bits` (split по символам/словам,
ключевые значения, easing по имени); логотип и `LowerThird`/`Title` —
`spring` + `interpolate` от `useCurrentFrame`. CSS-анимаций, таймеров, rAF,
fetch нет. Итог: все 12 записей `native` (технически).

## Типовые адаптации

- Шрифт — системный `SF Pro Display/Text, Helvetica, Arial`, не
  загружается: на Linux/CI будет fallback. Подключить шрифт через
  `@remotion/google-fonts` или `staticFile`.
- `HeroTitle` игнорирует `startFrame`/`durationInFrames` (frames [0,20] зашиты).
- `CameraMotionBlur` samples 10 кратно увеличивает время рендера.
- Размеры `clockWipe` и центр логотипа зашиты под 1920×1080.
- `Arc`/`Atom` используют `random(null)` для id градиентов (в `useState`) —
  влияет только на id.

## Что пропущено

- `src/components/text/Subtitle.tsx` — плейсхолдер с захардкоженным
  текстом «Edit src/Root.tsx and save to reload.» (opacity-fade), без props.
- `src/components/scenes/IntroScene.tsx` — пустая заглушка «Intro Scene».
- `src/index.ts`, `src/index.css`, `remotion.config.ts` — инфраструктура.
- `Arc`, `Atom` описаны в карточке `only-logo`, отдельных записей нет.

## Расхождения README и кода

- README указывает `components/text/BodyCopy.tsx` и `components/KineticBurst.tsx`;
  реальные файлы — `src/BodyCopy.tsx`, `src/KineticBurst.tsx`
  (по README-путям файлов нет). `src/HeroTitle.tsx` — реэкспорт из
  `components/text/HeroTitle.tsx`.
- README: HeroTitle — «word cascade», в коде `split: "none"`.

## Чего не удалось выяснить

- Каталог нельзя было пролистать `ls`/`find` (Bash вне worktree запрещён
  режимом dontAsk): файлы найдены по импортам и дереву из README.
  Неимпортированные и не упомянутые в README файлы (например, каталог
  `.agents/`, упомянутый в README, `public/`) могли быть пропущены; где
  используется `culori` — неизвестно.
- Рендер не выполнялся — `verification: static-review`.
