# GlitchText — `react-bits/glitch-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Крупный заголовок с цифровым глитчем: две копии текста, обрезанные
полосами, сдвигаются в стороны с красной/циановой тенью. Режимы:
`slices` (плавающие полосы), `rgb` (дрожащее цветовое расслоение),
`scan` (полоса-разрыв пробегает сверху вниз), `noise` (буквы на миг
подменяются символами `#%&@$?…`). Есть мерцание и перекос.

## Когда использовать

Сбой, взлом, ошибка, «что-то пошло не так», киберпанк-заставка,
переход между сценами. Работает постоянно (`trigger='always'`) или
вспышками. Не для спокойного делового ролика.

## Фразы из озвучки

- «система дала сбой»
- «а потом случилась ошибка»
- «данные были повреждены»
- «перезагрузка»

## Визуальный стиль

Агрессивный, техно: `font-weight: 900`, `clamp(2rem, 10vw, 8rem)`,
тени `['#ff0000', '#00ffff']`.

## Входные данные

`children`, `speed=0.5`, `enableShadows=true`, `enableOnHover=false`,
`offset=10`, `shadowColors=['#ff0000','#00ffff']`, `className=''`,
`mode='slices'` (`slices|rgb|scan|noise`), `intensity=0.5`, `skew=0`,
`flicker=false`, `trigger='always'` (`always|hover|click`),
`burstDuration=0.6`, `color?`, `fontSize?`, `fontWeight?`.

## Анимации

rAF-цикл пишет CSS-переменные `--glitch-a-top/-bottom/-x/-y`,
`--glitch-skew`, `--glitch-alpha`, `--glitch-split`; CSS превращает их в
`clip-path`, маски и `translate3d`. В `slices` полосы — `bandAt(pingPong(
clock, 3*speed))`; случайные «события» и подмена глифов — `Math.random`
с шагом ~70 мс.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/GlitchText/GlitchText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/GlitchText/GlitchText.css` — маски и слои
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/GlitchText/GlitchText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/GlitchTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/glitch-text

## Зависимости

`react`; CSS-маски (`mask-composite`).

## Совместимость и адаптация

`adaptable`: разметка и CSS остаются, меняется только источник
переменных. Рецепт: убрать rAF/`IntersectionObserver`/hover; в рендере
считать `clock = frame / fps`, шаг `stepIndex = floor(clock*1000 /
stepLength(speed))`, все `Math.random()` заменить на
`random(\`glitch-${stepIndex}-${k}\`)` из remotion — тогда события и
подмены глифов детерминированы; переменные положить в `style` корня.

## Паттерны

`key-point-emphasis`, `cause-effect`
