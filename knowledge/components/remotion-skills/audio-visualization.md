# Audio visualization — `remotion-skills/audio-visualization`

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

Не рисует; документ о визуализации звука через `@remotion/media-utils`.

## Когда использовать

Подкаст, аудиограмма, музыкальный ролик, пульсация в такт. Данные —
`useWindowedAudioData({src, frame, fps, windowInSeconds})`. `audioData` и
`frame` передавать детям от родителя (иначе разрывы внутри `Sequence`).

## Фразы из озвучки

- «слушайте, как звучит голос»
- «картинка пульсирует в такт музыке»
- «вот спектр этого трека»

## Визуальный стиль

Описываемый визуал: вертикальные бары спектра, гладкая SVG-волна,
пульсирующие элементы.

## Входные данные

Нет (документ).

## Анимации

- спектр: `visualizeAudio({fps, frame, audioData, numberOfSamples: 256, optimizeFor: 'speed', dataOffsetInSeconds})` (степень двойки, 0..1, слева бас);
- осциллограмма: `visualizeAudioWaveform` + `createSmoothSvgPath`;
- бас: среднее первых 32 частот → `scale`/`opacity`;
- громкость: `getWaveformPortion` → `{index, amplitude}`;
- логарифмическая нормализация в дБ.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/audio-visualization.md`

## Зависимости

`@remotion/media-utils`, `remotion`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

`quantities`
