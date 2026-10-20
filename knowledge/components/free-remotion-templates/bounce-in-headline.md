# Bounce-In Headline — `free-remotion-templates/bounce-in-headline`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Заголовок одной строкой появляется и несколько раз подпрыгивает с
затухающей амплитудой, после чего замирает по центру.

## Когда использовать

Бодрая, игривая подача короткого заголовка: анонс, призыв, «вау-факт».
Важно: README говорит «word by word», но по коду строка прыгает целиком,
без разбивки на слова. Для пословного входа — `kinetic-word-stack`.

## Фразы из озвучки

- «а теперь самое интересное!»
- «и это ещё не всё»
- «готовы? поехали!»

## Визуальный стиль

Тёмный фон `#111827`, жёлтый текст `#fbbf24`, 130px weight 900,
разрядка 6. Системный стек `-apple-system, "Segoe UI", Roboto,
sans-serif`. 1920×1080, 120 кадров (4 с), 30 fps.

## Входные данные

`BounceInHeadlineProps`: `headline` («Make It Bounce»), `background`
(`#111827`), `color` (`#fbbf24`), `bounces` (3), `height` (120 px —
максимум отскока), `delay` (8 кадров), `duration` (36 кадров).

## Анимации

`interpolate` frame → progress за `duration`; высота
`|sin(progress·π·bounces)|·height·(1−progress)` → translateY; opacity
0→1 за первые 10 % прогресса.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/bounce-in-headline/BounceInHeadline.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`AbsoluteFill`, `interpolate`, `useCurrentFrame`), `react`.

## Совместимость и адаптация

`native`, адаптаций нет. Размер шрифта зашит (130px) — длинные заголовки
вылезут за кадр; вынести `fontSize` в props при необходимости.

## Паттерны

`key-point-emphasis`
