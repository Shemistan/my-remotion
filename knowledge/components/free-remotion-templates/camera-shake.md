# Camera Shake — `free-remotion-templates/camera-shake`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `transitions-scene` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Заголовок в рамке акцентного цвета; в момент «удара» весь кадр трясётся с
затуханием, вспыхивает белым, от центра разлетаются 12 SVG-лучей, заголовок
слегка «подпрыгивает» по масштабу.

## Когда использовать

Акцент на резком событии: сбой, взлом, «бах», неожиданная новость, удар по
рынку. Это самодостаточная демо-композиция с собственным заголовком; чтобы
трясти произвольную сцену, нужно перенести обёртку-трансформацию на
`children`. Для спокойной смены сцен не брать — см. `slide-wipe`.

## Фразы из озвучки

- «и тут всё рухнуло»
- «система была взломана за одну ночь»
- «это был настоящий удар по рынку»
- «внезапно случилось то, чего никто не ждал»

## Визуальный стиль

Тёмный фон `#111827`, янтарный акцент `#f59e0b`, жирный капс 124 px (на 1920),
рамка 6 px. Резкий, «аварийный». 1920×1080, 120 кадров, 30 fps; шрифт
`-apple-system, "Segoe UI", Roboto, sans-serif`.

## Входные данные

`CameraShakeProps`: `title` («IMPACT»), `subtitle?` («System breach
detected»), `background` (`#111827`), `textColor` (`#fef3c7`), `accentColor`
(`#f59e0b`), `maxIntensity?` (28 px), `impactAt?` (0.9 с), `shakeDuration?`
(1.6 с).

## Анимации

Фейд-ин 0–10 кадров; от `impactAt·fps` — сдвиг x/y и поворот ≤1.5° из
детерминированного шума `pseudoRand(frame, seed)` (sin-хэш) × затухание
`Easing.out(cubic)` за `shakeDuration`; белая вспышка 0→0.45→0 за 10 кадров;
лучи растут и гаснут 30 кадров; масштаб заголовка 1→1.08→1.02.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/camera-shake/CameraShake.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion` (`interpolate`, `Easing`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`: всё — функция кадра, случайность детерминирована (sin-хэш, не
`Math.random`). Для монтажа: вынести контент в `children`, оставив
трансформацию тряски и вспышку.

## Паттерны

`key-point-emphasis`, `cause-effect`
