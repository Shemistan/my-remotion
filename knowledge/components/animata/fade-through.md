# FadeThrough — `animata/fade-through`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Material-переход «fade through»: строка целиком гаснет (лёгкий сдвиг вверх),
следующая проявляется с 6px снизу, лёгким blur и масштабом 0.99.

## Когда использовать

Нейтральная замена одной формулировки на другую без акцента на буквах:
подписи, лозунги, смена статуса. Для эффектного входа — `animata/focus-blur-resolve`.

## Фразы из озвучки

- «иначе говоря»
- «теперь по-другому»
- «новая версия формулировки»

## Визуальный стиль

Корпоративный, сдержанный, быстрый (420/260 мс).

## Входные данные

`text?: string | string[]`, `enter?`, `exit?`, `speed?` (0.72), `holdMs?`
(550), `gapMs?` (320), `yTravel?` (0.58), `className?`. Спека: `target:
"whole"`; enter 420 / `cubic-bezier(0.2,0,0,1)`, from `{opacity 0, yPx 6,
scale 0.99, blurPx 2}`; exit 260 / `cubic-bezier(0.4,0,1,1)`, to `{opacity 0,
yPx −4}`; swap `sequential`, `microDelayMs 60`.

## Анимации

Вся строка одним юнитом: opacity, translateY, scale, blur.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/fade-through.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/fade-through.mdx` — документация
- `templates/react-libriry/animata/animata/text/fade-through.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

WAAPI-runtime с таймерами. Рецепт «TextAnimator → кадр» (один юнит без
stagger) в `compatibility/animata-text-graphs-cards.md`.

## Паттерны

`transformation`, `comparison`
