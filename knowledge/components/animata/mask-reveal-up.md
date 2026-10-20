# MaskRevealUp — `animata/mask-reveal-up`

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

Заголовок в 1–2 строки поднимается снизу (30px) из размытия с коротким
stagger между строками — ощущение «маски». Настоящего clip-path нет: эффект
достигается opacity + blur + translateY.

## Когда использовать

Крупный заголовок сцены, титр раздела. Для горизонтального входа —
`animata/line-by-line-slide`.

## Фразы из озвучки

- «новая глава»
- «переходим к главному»
- «заголовок этого раздела»

## Визуальный стиль

Чистый, «эппловский» титр; 760 мс, stagger 90.

## Входные данные

`text?: string | string[]` (строки через `\n`), `enter?`, `exit?`, `speed?`,
`holdMs?`, `gapMs?`, `yTravel?`, `className?`. Спека: `per-line`; enter 760 / 90
/ `cubic-bezier(0.22,1,0.36,1)`, from `{opacity 0, yPx 30, blurPx 6}`; exit 520
/ 70, to `{opacity 0, yPx −22, blurPx 6}`; `microDelayMs 35`.

## Анимации

Stagger по строкам: translateY, opacity, blur.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/mask-reveal-up.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/mask-reveal-up.mdx` — документация
- `templates/react-libriry/animata/animata/text/mask-reveal-up.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

Рецепт «TextAnimator → кадр» в `compatibility/animata-text-graphs-cards.md`.
Для настоящей маски добавить обёртку строки с `overflow: hidden`.

## Паттерны

`key-point-emphasis`, `sequence-steps`
