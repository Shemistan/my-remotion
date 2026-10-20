# Skill remotion-markup — `remotion-skills/remotion-markup`

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

Не рисует; главный документ о разметке Remotion и оглавление тематических
правил (тайминг, переходы, звук, видео, эффекты, 3D, шрифты, субтитры,
карты, композиции).

## Когда использовать

Всегда при написании сцены. Базовые правила:

- `fps` из `useVideoConfig()` для всех пересчётов секунд в кадры, выражение
  прямо на JSX (`trimBefore={4 * fps}`);
- анимация — `useCurrentFrame()` + `interpolate()`; CSS `transition`/
  `animation` и Tailwind-анимации в рендере не работают;
- `Easing.bezier()`/`Easing.spring()`; для scale — `output: 'perceptual-scale'`;
- свойства `scale`/`translate`/`rotate` вместо строки `transform`;
- медиа: `<Video>`/`<Audio>` из `@remotion/media`, `<CanvasImage>`,
  `<AnimatedImage>`; ассеты в `public/` через `staticFile()`;
- эффекты через проп `effects` (таблица поддерживающих компонентов и
  перечень `@remotion/effects`), группа — через `<HtmlInCanvas>`;
- пакеты ставить `npx remotion add <pkg>`.

## Фразы из озвучки

- «заголовок плавно появляется»
- «логотип вырастает в центре»
- «добавим фоновое видео и музыку»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

`interpolate` с clamp, `Easing.bezier(0.16, 1, 0.3, 1)`,
`Easing.spring({damping: 200})`, perceptual-scale, `Interactive.Div`.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/SKILL.md`
- `official_skills/skills/skills/remotion-best-practices/remotion-markup/REFERENCE.md` — копия со ссылками

## Зависимости

`remotion`, `@remotion/media`, `@remotion/effects`.

## Совместимость и адаптация

Нет; документ. Это первоисточник правила «CSS-анимации не рендерятся» для
адаптации чужих компонентов.

## Паттерны

нет
