# Adaptive silence detection — `remotion-skills/silence-detection`

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

Не рисует; документ об адаптивном поиске тишины в видео и аудио.

## Когда использовать

Перед монтажом голоса/интервью: вырезать паузы, сделать джамп-каты. Шаг 1 —
замер громкости фильтром `loudnorm` (EBU R128, JSON), затем `silencedetect`
с порогом от измеренной громкости; FFmpeg через `npx remotion ffmpeg`.

## Фразы из озвучки

- «уберём паузы из записи»
- «темп речи без пауз»
- «джамп-каты в интервью»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/silence-detection.md`
- см. `remotion-skills/ffmpeg`

## Зависимости

`@remotion/cli` (встроенный ffmpeg).

## Совместимость и адаптация

Нет; документ.

## Паттерны

нет
