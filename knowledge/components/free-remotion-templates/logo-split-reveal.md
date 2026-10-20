# Logo Split Reveal — `free-remotion-templates/logo-split-reveal`

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

Левая и правая половины текстового логотипа съезжаются из-за краёв кадра
к центру; в момент стыка — вспышка-шов, затем разрядка букв плавно
«оседает». Логотип остаётся на экране до последнего кадра.

## Когда использовать

Интро бренда, «соединение двух частей» (слияние, партнёрство, две команды
в одну). Для мягкого фокуса — `logo-blur-reveal`.

## Фразы из озвучки

- «две команды объединились в одну»
- «всё сходится в одной точке»
- «так появилось название RENDERCOMP»

## Визуальный стиль

Светлый фон `#F8FAFC`, тёмный текст weight 900; размер шрифта
автоматически ужимается в title-safe (~86 % ширины). Системный стек
`-apple-system, "Segoe UI", Roboto, sans-serif`. 1920×1080, 120 кадров
(4 с), 30 fps.

## Входные данные

`LogoSplitRevealProps`: `logoText` («RENDERCOMP»), `splitOffset` (960 px),
`revealDuration` (1.4 с), `logoColor` (`#0F172A`), `backgroundColor`
(`#F8FAFC`), `fontSize` (260), `duration` (4 с).

## Анимации

Два слоя текста с `clipPath: inset(0 50% 0 0)` / `inset(0 0 0 50%)`;
`interpolate` с `Easing.out(Easing.cubic)` → translateX ±splitOffset→0,
opacity 0.22→1; вспышка шва при progress 0.72→1; `letterSpacing`
0.085→0.06em до конца клипа.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/logo-split-reveal/LogoSplitReveal.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`interpolate`, `Easing`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`. Ширина текста оценивается эвристикой (0.74em на символ, без
DOM-измерений) — для нелатинских/строчных букв подстроить `fontSize`.

## Паттерны

`key-point-emphasis`, `relationships`
