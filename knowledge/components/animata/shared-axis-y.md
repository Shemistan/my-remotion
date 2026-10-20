# SharedAxisY — `animata/shared-axis-y`

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

Жёсткая смена слов «по ступенькам»: каждое слово появляется мгновенно
(easing `steps(1, jump-start)`) с шагом 78 мс — без плавности, только ритм.

## Когда использовать

Монтажный, редакционный ритм: перечисление под бит, резкие смены. Не для
спокойного рассказа.

## Фразы из озвучки

- «раз, два, три»
- «чётко и по делу»
- «смена за сменой»

## Визуальный стиль

Резкий, «журнальный», ритмичный. Несмотря на название, сдвига по Y нет
(`yPx 0` в спеке) — меняется только opacity.

## Входные данные

`text?: string | string[]`, `enter?`, `exit?`, `speed?`, `holdMs?`, `gapMs?`,
`yTravel?`, `className?`. Спека: `per-word`; enter 180 / 78 / `steps(1,
jump-start)`, opacity 0 → 1; exit 140 / 78, opacity 1 → 0; swap `crossfade`,
`microDelayMs 28`.

## Анимации

Ступенчатое появление/исчезновение слов по одному.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/shared-axis-y.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/shared-axis-y.mdx` — документация
- `templates/react-libriry/animata/animata/text/shared-axis-y.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

Самый простой пресет для кадра: слово i видно, если `ms ≥ i·78·speed`
(рецепт «TextAnimator → кадр» без интерполяции).

## Паттерны

`sequence-steps`, `key-point-emphasis`
