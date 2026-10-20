# SharedAxisZ — `animata/shared-axis-z`

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

Переход по оси глубины: новая строка выходит «из глубины» (scale 0.9 → 1,
blur 2 → 0), старая уходит «на зрителя» (scale 1.06, blur 1).

## Когда использовать

Смена уровня детализации: «приблизимся», «шаг назад», переход от общего к
частному.

## Фразы из озвучки

- «посмотрим ближе»
- «отойдём на шаг назад»
- «глубже в детали»

## Визуальный стиль

Пространственный, но сдержанный; 520/360 мс.

## Входные данные

`text?: string | string[]`, `enter?`, `exit?`, `speed?`, `holdMs?`, `gapMs?`,
`yTravel?`, `className?`. Спека: `whole`; enter 520 /
`cubic-bezier(0.2,0,0,1)`, from `{opacity 0, scale 0.9, blurPx 2}`; exit 360 /
`cubic-bezier(0.4,0,1,1)`, to `{opacity 0, scale 1.06, blurPx 1}`;
`microDelayMs 20`.

## Анимации

Один юнит: scale, opacity, blur.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/shared-axis-z.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/shared-axis-z.mdx` — документация
- `templates/react-libriry/animata/animata/text/shared-axis-z.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

Рецепт «TextAnimator → кадр» в `compatibility/animata-text-graphs-cards.md`.

## Паттерны

`spatial`, `transformation`
