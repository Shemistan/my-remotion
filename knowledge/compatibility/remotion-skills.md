# remotion-skills (@remotion/skills 4.0.537) — совместимость с Remotion

Репозиторий `official_skills/skills` — официальные Agent Skills Remotion
(`package.json`: `@remotion/skills`, `private: true`, версия 4.0.537;
`repository.url` указывает на `packages/skills` монорепо remotion-dev).

## Лицензия

**Не указана.** В корне нет `LICENSE`/`LICENSE.md`, в `package.json` нет поля
`license`, README лицензию не называет; каталог awesome-claude-video-skills
(`data/skills.json`) для `remotion-dev/skills` тоже даёт `"license": null`.
Сам Remotion распространяется под собственной Remotion License (бесплатно
для частных лиц и небольших компаний, платно для компаний крупнее; сведение
не из этого репозитория, сверить на remotion.dev/license) — это
относится к пакетам `remotion`/`@remotion/*`, которые используют описанные
приёмы. Вывод: документы читать и следовать им можно, копировать тексты и
ассеты (`CesiumFlythrough.tsx`, `RiverReveal.tsx`) в свой репозиторий — только
после уточнения лицензии у правообладателя.

## Состав и структура

- `skills/<skill>/SKILL.md` — 12 самостоятельных skills: `remotion-best-practices`
  (маршрутизатор), `remotion-create`, `remotion-markup`, `remotion-studio`,
  `remotion-render`, `remotion-maps`, `remotion-captions`, `remotion-saas`,
  `remotion-interactivity`, `remotion-docs`, `remotion-upgrade`,
  `remotion-multimedia`; рядом — тематические файлы правил.
- `skills/remotion-best-practices/<skill>/REFERENCE.md` + те же файлы —
  **зеркало** всех skills внутри маршрутизатора; в зеркале ссылки между
  файлами живые, в самостоятельных копиях межскилловые ссылки вырезаны до
  простого текста. Записи базы ссылаются на самостоятельные копии
  (`skills/<skill>/…`); зеркало упомянуто в `docs` там, где проверено.
- `README.md` — генерируется `packages/skills/scripts/sync-readme.ts`.

Записей: 66 — 63 `doc` (`knowledge-docs`), 1 `component` (`3d-camera`,
`cesium-flythrough`), 1 `component` (`text-animation`, `country-label`),
1 `example` (`diagrams-flow`, `river-reveal`). Все `native`.

## Общий стек

Документы учат только покадровому Remotion: `useCurrentFrame()` +
`interpolate()`, `Easing.bezier/spring`, `Sequence`/`Track`/
`TransitionSeries`, `@remotion/media`, `@remotion/effects` (WebGL2/WebGPU),
`HtmlInCanvas`, `Interactive.*` для редактирования в Studio. Это первоисточник
для адаптации чужих компонентов:

| Флаг чужого компонента | Документ-рецепт |
|---|---|
| `css-animation`, `css-transition` | `remotion-markup`, `timing`, `tailwind` |
| `engine:three` | `3d` |
| `dom` (измерения) | `measuring-dom-nodes`, `measuring-text` |
| `async-data` | `calculate-metadata`, `lottie` (delayRender) |
| шрифты по CSS | `google-fonts`, `local-fonts` |
| GIF/Lottie с автоплеем | `gifs`, `lottie` |
| посимвольный текст на RTL | `arabic-text` |

## Реальные TSX внутри skills

- `remotion-maps/techniques/cesium/assets/CesiumFlythrough.tsx` →
  `remotion-skills/cesium-flythrough` (+ `flight-path.ts`, `example-Root.tsx`).
- `remotion-maps/techniques/maptiler/assets/RiverReveal.tsx` →
  `remotion-skills/river-reveal`; `CountryLabel.tsx` →
  `remotion-skills/country-label`.
- Не отдельными записями: `MapTilerVectorElement.ts` (утилита добавления
  векторных слоёв MapTiler Planet, без своей картинки), `tokens.ts`,
  `sample-data/*.json`, `scripts/prep-geo.mjs`, `scripts/prep-cesium-path.mjs`
  (подготовка данных) — упомянуты в карточках `maps-maptiler`/`maps-cesium`.

Типовые требования для карт: ключи окружения (`REMOTION_MAPBOX_TOKEN`,
`REMOTION_MAPTILER_KEY`, `REMOTION_GOOGLE_MAPS_API_KEY`), сеть для тайлов,
`--gl=angle --concurrency=1`, `delayRender` на каждый кадр, не вызывать
`jumpTo()` каждый кадр при движущейся камере (шимер) — «фиксированная
подложка».

## Что пропущено и почему

- Копии в `skills/remotion-best-practices/*/` — дубли тех же документов.
- `README.md` — оглавление, в базе как `docs` у `remotion-best-practices`.
- Справочники, на которые ссылаются как на внешние URL (Basic Captions,
  remotion.dev/docs) — не в репозитории.

## Чего не удалось выяснить

- **Полный листинг репозитория не получен**: Bash в сессии разрешал только
  чтение внутри worktree, Glob/Grep не было. Файлы найдены по ссылкам из
  `SKILL.md`/`REFERENCE.md`/`TECHNIQUE.md` и проверены чтением. Файлы, на
  которые нет ссылок (например, `src/` для `remotion studio` из
  `package.json` scripts, примеры к правилам, `evals`), могли остаться не
  найденными; `src/Root.tsx`, `src/index.ts`, `remotion.config.ts` по
  догадке отсутствуют.
- Тексты `references/*.md` карт прочитаны частично (заголовки и начало);
  `country-meta.json`/путевые JSON — только наличие.
- Рендер не делался (`verification: static-review`);
  `python3 tools/kb.py check --repo remotion-skills` не запускался
  (заблокирован), поля сверены вручную по схеме `knowledge/README.md`.
