# DiaTextReveal — `magicui/dia-text-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Текст проявляется слева направо: по нему проходит цветная полоса
(градиентный «бэнд» из 3–5 цветов), за полосой остаётся текст
основного цвета, впереди — пусто. В режиме массива слов — смена слов
с повторным проходом и анимацией ширины.

## Когда использовать

Эффектное появление заголовка или названия бренда; смена ключевых слов
(«быстро / надёжно / просто»). Для посимвольного появления без
цвета — `text-animate`.

## Фразы из озвучки

- «представляем новое имя»
- «быстро, надёжно и просто»
- «всё начинается с одного слова»

## Визуальный стиль

Яркая радужная полоса (по умолчанию `#c679c4 #fa3d1d #ffb005 #e1e1fe
#0358f7`) на чистой типографике; ease in-out cubic, 1.5 с.

## Входные данные

- `text: string | string[]` (обязателен)
- `colors?: string[]` = встроенная палитра; `textColor?` = `"var(--foreground)"`
- `duration?` = `1.5` с; `delay?` = `0` с
- `repeat?` = `false`; `repeatDelay?` = `0.5` с (только для массива)
- `startOnView?` = `true`; `once?` = `true`; `fixedWidth?` = `false`
- `className`, прочие `HTMLMotionProps<"span">`.

## Анимации

`animate(sweepPos, 117)` от `-17` с `sweepEase`; `useTransform` строит
`backgroundImage` через чистую функцию `buildGradient(pos, colors,
textColor)` (`bg-clip: text`). Повтор — `setTimeout`; ширина слов
измеряется клоном (`getBoundingClientRect`) и анимируется `motion`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/dia-text-reveal.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/dia-text-reveal.mdx` — документация
- `templates/react-libriry/magicui/apps/www/registry/example/dia-text-reveal-demo.tsx` — пример

## Зависимости

`motion` (`animate`, `useMotionValue`, `useTransform`, `useInView`,
`useReducedMotion`), `cn`.

## Совместимость и адаптация

`adaptable`. Ядро — `buildGradient(pos)`: `pos = -17 + 134·sweepEase(
clamp((frame-delay)/dur))`, результат сразу в `style.backgroundImage`.
Убрать `useInView`/`setTimeout`; для массива слов индекс = `floor(t /
(duration+repeatDelay))`, ширину задать фиксированно (`fixedWidth`)
или измерить один раз с `delayRender`.

## Паттерны

`key-point-emphasis`, `transformation`
