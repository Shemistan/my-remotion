# Editable video timelines — `remotion-skills/video-editing`

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

Не рисует; документ о монтаже клипов в Remotion.

## Когда использовать

Композиция — в основном таймлайн видео и звука (интервью, перебивки, музыка):

- `Track` для независимых клипов, `TransitionSeries` — для смежных;
- видео шота, его субтитры и синхронные оверлеи — под одной границей
  тайминга (`trimBefore`, `durationInFrames`, `playbackRate` один раз);
- оверлей, живущий через несколько склеек, — в объемлющей сцене;
- перебивки — на дорожке `Cutaways`, музыка — на общей дорожке;
- при рефакторинге сохранять тримы, скорости, массивы субтитров, громкость.

## Фразы из озвучки

- «вот фрагмент интервью»
- «перебивка на кадры продукта»
- «музыка затихает под голос»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет; структура. В примере — `TransitionSeries` с `Video` и `BasicCaptions`.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/video-editing.md`

## Зависимости

`remotion`, `@remotion/media`, `@remotion/transitions`.

## Совместимость и адаптация

Нет; документ. `BasicCaptions` — элемент Remotion Elements, копируется в
проект (см. `remotion-skills/display-captions`).

## Паттерны

`timeline`, `sequence-steps`
