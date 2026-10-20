# Logo Stroke Draw — `free-remotion-templates/logo-stroke-draw`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `icons-shapes` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Кольцо бейджа прорисовывается «пером» (светящийся кончик бежит по
окружности), затем заливается, проявляется монограмма, по бейджу
проходит блик, снизу появляется название бренда с подчёркиванием.

## Когда использовать

Брендовая заставка с акцентом на «создание/рисование», эмблема, печать
качества. Та же композиция, что `logo-mask-wipe`, но вход через
прорисовку контура.

## Фразы из озвучки

- «мы создали это с нуля»
- «знак качества, которому доверяют»
- «линия за линией складывается образ компании»

## Визуальный стиль

Тёмный фон `#0a0800`, золотой `#eab308`, светлый `#fefce8`; радиальное
свечение, диагональный блик. Системный стек `-apple-system, "Segoe UI",
Roboto, sans-serif`. 1920×1080, 110 кадров (3.67 с), 30 fps.

## Входные данные

`LogoStrokeDrawProps`: `backgroundColor` (`#0a0800`), `accentColor`
(`#eab308`), `textColor` (`#fefce8`), `monogram` («A»), `brandText`
(«ACME INC.»).

## Анимации

`strokeDashoffset` окружности 0→50 кадр + точка-кончик по углу; заливка и
монограмма 44→66; `spring` масштаба 0.94→1 с 44 кадра; блик (rect в
`clipPath`) 58→84; название 60→78; лёгкое снижение opacity 100→109.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/logo-stroke-draw/LogoStrokeDraw.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`interpolate`, `spring`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`. Фиксированный `clipPath id="lsd-shine-clip"` — уникализировать
при нескольких экземплярах. Прорисовывается только кольцо, не
произвольный путь логотипа; для своего пути — тот же приём
`strokeDasharray`/`strokeDashoffset`.

## Паттерны

`key-point-emphasis`, `transformation`
