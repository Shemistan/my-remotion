# Flying Through Words (bit) — `remotion-bits/bit-flying-through-words`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `particles-effects` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

«Туннель» из слов: названия ИИ-моделей (GPT, Claude, Gemini, LLaMA, Qwen…)
рождаются в глубине по всему кадру и летят на зрителя, проявляясь и
затухая — эффект полёта сквозь облако терминов.

## Когда использовать

Обзор рынка, «вокруг десятки технологий», поток понятий/брендов/хэштегов,
перегрузка информацией. Для спокойной подачи списка — `bit-list-reveal`.

## Фразы из озвучки

- «на рынке десятки языковых моделей»
- «нас окружает поток информации»
- «каждый день появляются новые названия»

## Визуальный стиль

Крупный текст 10 vmin, наследуемый цвет, сильная перспектива (5000, на узком
экране 1000); 300 кадров, 1920×1080. Лежит в папке scene-3d, но построен на
частицах, не на `Scene3D`.

## Входные данные

Без props: массив `WORDS` (12 названий) — варианты частиц, выбираются по
seed. `Spawner`: `rate` 0.2, `area` = кадр × глубина −50 vmin, `position` —
центр (`resolvePoint`), `lifespan` 100, `velocity.z` 10 vmin ± 10 vmin.
Пустой `<Behavior />`.

## Анимации

`Particles` → движение по z каждую частицу; каждое слово — `StaggeredMotion`
с `opacity [0, 1, 0.5, 0.2, 0]` за жизнь частицы (`cycleOffset` = возраст).

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/scene-3d/FlyingThroughWords.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/flying-through-words.mdx` — документация

## Зависимости

`remotion-bits` (`Particles`, `Spawner`, `Behavior`, `StaggeredMotion`,
`useViewportRect`, `resolvePoint`). См. `remotion-bits/particle-system`.

## Совместимость и адаптация

`native`. Первые ~5 кадров пусто (rate 0.2 → первая частица на кадре 5);
для заполненного старта задать `startFrame` у `Particles`. Слова заменить
своими.

## Паттерны

`quantities`, `abstract-concepts`, `spatial`
