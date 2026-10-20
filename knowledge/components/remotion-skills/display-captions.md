# Displaying captions — `remotion-skills/display-captions`

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

Не рисует; документ о выводе субтитров элементом Basic Captions из Remotion
Elements.

## Когда использовать

Субтитры уже в формате `Caption`. Взять исходник с
https://www.remotion.dev/elements/captions/basic-captions.md и скопировать
`basic-captions.tsx` без изменений (альтернативы — в каталоге Elements).
Правила: видео и его субтитры — в одном `Sequence`/`TransitionSeries.Sequence`
(`trimBefore`, `durationInFrames`, `playbackRate` на общем родителе);
массив `captions` — inline-литералом на `<BasicCaptions>` (иначе Caption
editor не сможет писать в код); задать ширину области и позицию (900px по
центру 1920px кадра — `translate: '510px 0px'`).

## Фразы из озвучки

- «субтитры внизу кадра»
- «фраза за фразой»
- «текст речи на экране»

## Визуальный стиль

Описываемый визуал — блок субтитров внизу кадра.

## Входные данные

Нет (документ).

## Анимации

Показ подписей по времени `Caption`.

## Исходники и документация

- `official_skills/skills/skills/remotion-captions/display-captions.md`

## Зависимости

`@remotion/captions`, `@remotion/media`, `@remotion/transitions`.

## Совместимость и адаптация

Нет; документ. Код Basic Captions — внешний ресурс, в репозитории его нет.

## Паттерны

нет
