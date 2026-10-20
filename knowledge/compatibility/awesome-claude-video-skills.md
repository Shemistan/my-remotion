# awesome-claude-video-skills — совместимость с Remotion

Репозиторий `templates/remotion-components/awesome-claude-video-skills`
(zhuyansen) — awesome-список 318 открытых skills/тулкитов для видео с
агентами, собранный и оценённый Agent Skills Hub (agentskillshub.top);
сгенерирован 2026-10-19 (по `data/skills.json` и подвалу README).

## Лицензия

`CC0 1.0 Universal` (`LICENSE`) — только на сам список (отбор, группировку,
тексты). Названия и описания репозиториев принадлежат авторам и
цитируются с GitHub; у каждого проекта своя лицензия, проверять перед
использованием. Превью в `assets/previews/` — уменьшенные копии картинок из
README проектов, включены только для проектов с разрешительной лицензией и
остаются под их лицензией (`assets/previews/NOTICE.md`).

## Что внутри

- `README.md` / `README.zh-CN.md` — каталог по 10 видам, таблица «Tested
  end to end», рекомендации «Which one to install», «Made with Claude Opus
  5.5», правила включения.
- `data/skills.json` — **структурированные данные**: `generated`, `source`,
  `kinds[]` (`id`, `icon`, `en`, `zh`), `skills[]` (`repo_full_name`,
  `path`, `stars`, `description`, `kind`, `security_grade`, `language`,
  `license`). Пригоден для программного отбора кандидатов.
- `assets/previews/*.gif|jpg` + `NOTICE.md` — превью и их источники.

Записей 3, все `doc` / `knowledge-docs` / `unknown`: `catalog`,
`e2e-test-results`, `skills-json`.

## Совместимость

`unknown` для всех: репозиторий не содержит кода — только ссылки и
метаданные. Многие проекты не на Remotion (HyperFrames, HTML + Playwright +
ffmpeg, p5.js, Blender, GPU-рендереры). Чтобы оценить конкретный проект, его
надо клонировать в `templates/` и пройти протокол отдельно.

Полезное для базы: по разделу тестов официальный `remotion-dev/skills`
(= `remotion-skills` здесь) даёт надёжный рендер, но вид «по умолчанию» —
нужна собственная визуальная библиотека, ради которой и собирается эта база.

## Что пропущено и почему

- Отдельные записи на 318 внешних проектов — их исходников нет; данные о них
  уже структурированы в `data/skills.json`.
- `assets/previews/*` — картинки чужих проектов, не компоненты.

## Чего не удалось выяснить

- Полный листинг каталога не получен (Bash вне worktree и Glob/Grep
  недоступны); найдены файлы, упомянутые в README. Других файлов в `data/`
  кроме `skills.json` не проверить.
- `data/skills.json` прочитан выборочно (схема и первые записи), не
  подсчитано, сколько записей относится к Remotion.
- `python3 tools/kb.py check --repo awesome-claude-video-skills` не
  запускался (заблокирован), поля сверены вручную.
