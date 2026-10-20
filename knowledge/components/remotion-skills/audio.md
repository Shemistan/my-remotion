# Audio — `remotion-skills/audio`

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

Не рисует; документ о `<Audio>` из `@remotion/media`.

## Когда использовать

Музыка, фон, голос. Несколько `<Audio>` наслаиваются. `trimBefore`/
`durationInFrames`, `from`, `volume` числом или `interpolate` (fade in/out),
`muted` по условию кадра (`frame >= 2 * fps && frame <= 4 * fps`),
`playbackRate`, `loop`, `toneFrequency` (только серверный рендер). Пропсы
`name`, `from`, `loop`, `volume` ставить прямо на `<Audio>`.

## Фразы из озвучки

- «на фоне играет музыка»
- «звук плавно нарастает»
- «на две секунды повисает тишина»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Громкость по ключам, mute на интервале.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/audio.md`
- звуковые эффекты — `remotion-skills/sfx`

## Зависимости

`@remotion/media`, `remotion`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

нет
