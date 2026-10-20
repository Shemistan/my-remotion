# remotion-motion-graphics-skill — совместимость с Remotion

Репозиторий `templates/remotion-components/remotion-motion-graphics-skill` —
Claude Code skill `remotion-motion-graphics` (fernandokaraka): моушн-графика
в Remotion с экспортом в MP4 и прозрачный ProRes/PNG.

## Лицензия

`MIT` — файл `LICENSE` («Copyright (c) 2026 Fernando Karakanian Melo») и
раздел License в README. Ограничение MIT: сохранять копирайт при
копировании. README сообщает, что принципы ремесла адаптированы из гайда
«Claude Code × Remotion — The Motion-Graphics Starter Kit» (Pouya Eti /
Rangy AI) — при цитировании упоминать источник.

## Состав

`skills/remotion-motion-graphics/SKILL.md` + `references/traps.md`,
`patterns.md`, `polish.md`, `scaffold.md` (по README, раздел «What's
inside», и прочитано). TSX-файлов нет — код только внутри Markdown.

Записей 6: 5 `doc` (`knowledge-docs`) и 1 `example` (`layout-templates`,
`badge-overlay` — полный компонент `BadgeOverlay` из раздела «Transparent
overlay» в `patterns.md`). Все `native`.

## Общий стек

Чистый покадровый Remotion: `spring()`, `interpolate()` с clamp, `Easing`,
`Sequence`/`Series`, `@remotion/transitions`, zod-схемы с `zColor()`,
`@remotion/layout-utils` (`fitText`), шрифты через `@remotion/google-fonts`/
`@remotion/fonts`. Конфиг проекта: `CANVAS` 1920×1080@30, `sec()`,
`SAFE_MARGIN = 0.05`.

## Типовые замечания

- В `patterns.md` `Audio` импортируется из `remotion`, а официальный
  `remotion-skills/audio` рекомендует `<Audio>` из `@remotion/media` —
  при переносе выбрать один вариант.
- Документы дополняют официальные skills: `traps.md` — лучший в базе
  чек-лист тихих ошибок (clamp, альфа, хуки в `.map()`, scaleX).

## Что пропущено и почему

- Фрагменты `TitleCard` (скелет с `// ...`), `Word`, «Animated number»,
  «Stagger» в `patterns.md`/`traps.md` — неполные сниппеты, а не
  самостоятельные компоненты; описаны в записи `patterns`.
- `LowerThird`, `KineticText` из `scaffold.md` — только описание, кода нет.
- README — общий обзор, в `docs` у записи skill.

## Чего не удалось выяснить

- Полный листинг каталога не получен (Bash вне worktree и Glob/Grep
  недоступны): наличие других файлов (evals, примеры) не проверено; состав
  взят из README и проверен чтением.
- Рендер не делался; `python3 tools/kb.py check --repo
  remotion-motion-graphics-skill` не запускался (заблокирован), поля
  сверены вручную.
