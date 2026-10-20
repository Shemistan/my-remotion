# Transparent videos — `remotion-skills/transparent-videos`

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

Не рисует; документ о рендере с альфа-каналом: ProRes или WebM.

## Когда использовать

Графику накладывают на видео в монтажке (ProRes 4444) или в браузере (WebM
VP9):

```bash
npx remotion render --image-format=png --pixel-format=yuva444p10le --codec=prores --prores-profile=4444 MyComp out.mov
```

По умолчанию для Studio — `Config.setVideoImageFormat("png")`,
`setPixelFormat("yuva444p10le")`, `setCodec("prores")` в
`remotion.config.ts` (перезапустить Studio).

## Фразы из озвучки

- «плашку наложим поверх записи»
- «титр с прозрачным фоном»
- «оверлей для монтажа»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет.

## Исходники и документация

- `official_skills/skills/skills/remotion-render/transparent-videos.md`

## Зависимости

`@remotion/cli`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

нет
