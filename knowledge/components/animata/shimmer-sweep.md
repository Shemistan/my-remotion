# ShimmerSweep — `animata/shimmer-sweep`

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

Строка «проплывает» слева к центру (−22px) из размытия 8px и уходит
вправо в blur. По коду бликового градиента нет — «shimmer» создаётся
только blur + сдвигом.

## Когда использовать

Мягкая смена слоганов, маркетинговые подписи. Если нужен настоящий
переливающийся градиент — `animata/animated-gradient-text`.

## Фразы из озвучки

- «новая волна»
- «легко и плавно»
- «следующий слоган»

## Визуальный стиль

Плавный, «текучий»; 850/650 мс.

## Входные данные

`text?: string | string[]`, `enter?`, `exit?`, `speed?`, `holdMs?`, `gapMs?`,
`yTravel?` (пресет двигает только по X), `className?`. Спека: `whole`; enter
850 / `cubic-bezier(0.22,1,0.36,1)`, from `{opacity 0, xPx −22, blurPx 8}`; exit
650 / `cubic-bezier(0.7,0,0.84,0)`, to `{opacity 0, xPx 22, blurPx 8}`; swap
`crossfade`, `microDelayMs 36`.

## Анимации

Один юнит: translateX, opacity, blur.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/shimmer-sweep.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/shimmer-sweep.mdx` — документация
- `templates/react-libriry/animata/animata/text/shimmer-sweep.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

Рецепт «TextAnimator → кадр» в `compatibility/animata-text-graphs-cards.md`.

## Паттерны

`transformation`
