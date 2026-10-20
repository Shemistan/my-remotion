# ScaleDownFade — `animata/scale-down-fade`

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

Строка «оседает» на место (масштаб 1.04 → 1, 8px снизу) и уходит с
уменьшением до 0.94 — сдержанное «прощание».

## Когда использовать

Завершение мысли, итоговая фраза, подпись перед сменой сцены.

## Фразы из озвучки

- «на этом всё»
- «итак, подведём итог»
- «и последнее»

## Визуальный стиль

Сдержанный, корпоративный; 520/380 мс.

## Входные данные

`text?: string | string[]`, `enter?`, `exit?`, `speed?`, `holdMs?`, `gapMs?`,
`yTravel?`, `className?`. Спека: `whole`; enter 520 /
`cubic-bezier(0.22,1,0.36,1)`, from `{opacity 0, yPx 8, scale 1.04}`; exit 380
/ `cubic-bezier(0.64,0,0.78,0)`, to `{opacity 0, yPx −8, scale 0.94}`;
`microDelayMs 20`.

## Анимации

Один юнит: opacity, translateY, scale.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/scale-down-fade.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/scale-down-fade.mdx` — документация
- `templates/react-libriry/animata/animata/text/scale-down-fade.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

Рецепт «TextAnimator → кадр» в `compatibility/animata-text-graphs-cards.md`.

## Паттерны

`key-point-emphasis`, `transformation`
