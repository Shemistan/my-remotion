# Logo Blur Reveal — `free-remotion-templates/logo-blur-reveal`

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

Текстовый логотип (wordmark) проявляется из сильного размытия в резкое
изображение с лёгким «наведением фокуса» по масштабу и затуханием в конце.

## Когда использовать

Интро/аутро бренда, появление названия продукта, момент «прояснения»
мысли. Для более энергичного входа — `logo-bounce-drop`; для логотипа из
SVG-пути — тоже `logo-bounce-drop` (здесь только текст).

## Фразы из озвучки

- «знакомьтесь — наш новый продукт»
- «картина постепенно проясняется»
- «всё встаёт на свои места»

## Визуальный стиль

Минимализм: светлый фон `#F8FAFC`, тёмный текст 260px weight 900,
разрядка 0.06em. Системный стек `-apple-system, "Segoe UI", Roboto,
sans-serif`. 1920×1080, 120 кадров (4 с), 30 fps.

## Входные данные

`LogoBlurRevealProps`: `logoText` («HELLO»), `blurAmount` (40, px),
`revealDuration` (1.6 с), `logoColor` (`#0F172A`), `backgroundColor`
(`#F8FAFC`), `fontSize` (260), `duration` (4 с — длина для расчёта
затухания).

## Анимации

`interpolate` 0→revealFrames с `Easing.out(Easing.cubic)`: `filter: blur`
blurAmount→0, opacity 0→1, scale 1.08→1.0; затухание всей сцены за
последние 0.4 с от `duration`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/logo-blur-reveal/LogoBlurReveal.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`AbsoluteFill`, `interpolate`, `useCurrentFrame`,
`useVideoConfig`, `Easing`), `react`.

## Совместимость и адаптация

`native`. Следить, чтобы `duration` совпадал с `durationInFrames`
композиции, иначе затухание сместится. Большой `blur` дорог в рендере.

## Паттерны

`key-point-emphasis`, `transformation`
