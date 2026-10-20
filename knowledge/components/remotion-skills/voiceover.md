# AI voiceover (ElevenLabs TTS) — `remotion-skills/voiceover`

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

Не рисует; документ о синтезе закадрового голоса по сценам и подгонке
длительности композиции под аудио.

## Когда использовать

Ролик озвучивается TTS. Скрипт `generate-voiceover.ts` (запуск
`node --strip-types`) зовёт ElevenLabs (`eleven_multilingual_v2`) на каждую
сцену и пишет MP3 в `public/voiceover/<comp>/<scene>.mp3`;
`calculateMetadata` меряет длительности (`getAudioDuration`) и выставляет
`durationInFrames`, длительности сцен передаются в проп `voiceover`. С
`TransitionSeries` — вычесть перекрытия. Можно заменить провайдера TTS.

## Фразы из озвучки

- «закадровый голос рассказывает историю»
- «каждая сцена длится, сколько звучит фраза»
- «озвучим текст автоматически»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/voiceover.md`
- см. `remotion-skills/calculate-metadata`, `remotion-skills/get-audio-duration`

## Зависимости

`remotion`, ElevenLabs API (`ELEVENLABS_API_KEY`).

## Совместимость и адаптация

Нет; документ. Внешний API вызывается скриптом до рендера, не в компоненте.

## Паттерны

нет
