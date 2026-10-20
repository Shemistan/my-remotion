# claude-code-plugin — совместимость с Remotion

Репозиторий `official_skills/claude-code-plugin` — плагин Claude Code
`remotion` (`.claude-plugin/plugin.json`: displayName «Remotion», version
4.0.537, author Remotion, homepage
https://www.remotion.dev/docs/ai/claude-code-plugin). `README.md`:
«internal package and has no documentation».

## Лицензия

`MIT` — по полю `license` в `.claude-plugin/plugin.json`. Файлов `LICENSE`/
`LICENSE.md` в корне нет. Ограничения: MIT требует сохранять уведомление об
авторстве при копировании; сами пакеты `remotion`/`@remotion/*`, которые
документы рекомендуют, лицензируются отдельно (Remotion License).

## Что внутри

`skills/<skill>/SKILL.md` для тех же 12 skills, что и в `remotion-skills`
(@remotion/skills 4.0.537), плюс зеркало
`skills/remotion-best-practices/<skill>/…`. По выборочной сверке
(`remotion-best-practices/SKILL.md`, `remotion-markup/timing.md`, frontmatter
всех 12 `SKILL.md`, `remotion-maps/SKILL.md` целиком, `maptiler/TECHNIQUE.md`
раздел Files, `cesium/TECHNIQUE.md`) тексты совпадают с `remotion-skills`.

Поэтому записи здесь — по одной на skill (12, все `doc`/`knowledge-docs`,
`native`): каждая указывает на подробные записи `remotion-skills/*` по
отдельным документам. Дублировать 60+ одинаковых записей не стали, чтобы
поиск по `voiceover_cues` не возвращал одно и то же дважды.

## Отличие от remotion-skills

В плагине **нет `.tsx`-ассетов** техник карт, хотя `TECHNIQUE.md` на них
ссылаются. Проверено чтением (файл не существует):
`skills/remotion-maps/techniques/cesium/assets/CesiumFlythrough.tsx`,
`…/cesium/assets/example-Root.tsx`, `…/maptiler/assets/RiverReveal.tsx`,
`…/maptiler/assets/CountryLabel.tsx`, а также
`skills/remotion-best-practices/remotion-maps/techniques/cesium/assets/CesiumFlythrough.tsx`.
`.ts`-файлы на месте (`cesium/assets/flight-path.ts`,
`maptiler/assets/tokens.ts`). Вероятно, сборка плагина отбрасывает `.tsx`.
Готовые компоненты — `remotion-skills/cesium-flythrough`,
`remotion-skills/river-reveal`, `remotion-skills/country-label`.

## Общий стек и адаптации

Как у `remotion-skills` (см. `compatibility/remotion-skills.md`): только
покадровый Remotion; документы служат рецептами адаптации чужих компонентов.

## Что пропущено и почему

- Отдельные записи на файлы правил (`remotion-markup/*.md`, `maps/*`,
  `captions/*` и т.д.) — дубли `remotion-skills`; ссылки на них в карточках.
- `README.md` — без содержания.

## Чего не удалось выяснить

- Полного листинга нет (Bash вне worktree и Glob/Grep недоступны); файлы
  найдены по ссылкам и проверены чтением. Побайтовое совпадение всех файлов
  с `remotion-skills` не проверялось — только выборочно.
- `.claude-plugin/marketplace.json` есть (маркетплейс `remotion`, плагин из
  github `remotion-dev/claude-code-plugin`); `package.json` в корне нет. Есть
  ли `commands/`, `hooks/`, `agents/` — не выяснено.
- `python3 tools/kb.py check --repo claude-code-plugin` не запускался
  (заблокирован); поля сверены вручную.
