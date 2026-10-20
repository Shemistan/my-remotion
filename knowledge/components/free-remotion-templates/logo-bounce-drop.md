# Logo Bounce Drop — `free-remotion-templates/logo-bounce-drop`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `layout-templates` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Логотип (текст или SVG-пути) падает сверху и пружинисто приземляется с
лёгким «сплющиванием» в момент касания, в конце сцена затухает.

## Когда использовать

Игривое интро бренда, появление названия/иконки «с размаху». Для строгого
корпоративного входа — `logo-blur-reveal` или `logo-mask-wipe`.

## Фразы из озвучки

- «и вот он — наш логотип»
- «встречайте!»
- «бум — и задача решена»

## Визуальный стиль

Светлый фон `#F8FAFC`, тёмный логотип; текстовый режим — 240px weight 900,
системный стек `-apple-system, "Segoe UI", Roboto, sans-serif`. 1920×1080,
90 кадров (3 с), 30 fps.

## Входные данные

`LogoBounceDropProps`: `logoText` («RENDERCOMP»), `svgPath` ("" — пусто =
текстовый режим; несколько путей через `||`), `viewBox` ("0 0 300 300"),
`dropHeight` (0.6 доли высоты), `bounceStrength` (4; 1–10, меньше —
больше отскок), `logoColor` (`#0F172A`), `backgroundColor` (`#F8FAFC`),
`fontSize` (240), `duration` (3 с).

## Анимации

`spring` (stiffness 80, damping = 4 + bounceStrength·1.5) → translateY от
−dropHeight·height до 0; squash/stretch по `sin` при progress 0.85→1;
затухание последние 0.5 с.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/logo-bounce-drop/LogoBounceDrop.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`spring`, `interpolate`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`; адаптаций не нужно. Для SVG-логотипа передать `d` путей в
`svgPath` и подходящий `viewBox`.

## Паттерны

`key-point-emphasis`
