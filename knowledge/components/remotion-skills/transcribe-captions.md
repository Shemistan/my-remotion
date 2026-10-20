# Transcribing audio — `remotion-skills/transcribe-captions`

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

Не рисует; документ о локальной транскрибации речи в `Caption[]` функцией
`transcribe()` из `@remotion/whisper-webgpu` (Whisper на GPU, Node.js и
браузер).

## Когда использовать

Субтитров нет, есть запись голоса. Node-скрипт: декодирование в 16 кГц моно
(Mediabunny), скачивание модели (`downloadWhisperModel`, `loadWhisperModel`),
транскрибация, `toCaptions`. Нужен совместимый GPU; ONNX Runtime не работает
на Linux arm64.

## Фразы из озвучки

- «расшифруем интервью»
- «текст появляется синхронно с речью»
- «автоматические субтитры»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет.

## Исходники и документация

- `official_skills/skills/skills/remotion-captions/transcribe-captions.md`
- https://www.remotion.dev/docs/whisper-webgpu.md

## Зависимости

`@remotion/whisper-webgpu`, `@huggingface/transformers`, `mediabunny`,
`@mediabunny/server`.

## Совместимость и адаптация

Нет; документ. Выполняется до рендера; модель скачивается из сети.

## Паттерны

нет
