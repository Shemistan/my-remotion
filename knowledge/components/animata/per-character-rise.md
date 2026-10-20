# PerCharacterRise — `animata/per-character-rise`

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

Буквы быстро поднимаются на место (32px снизу) с коротким stagger 24 мс,
без blur — чёткая tvOS-подача; выход вверх.

## Когда использовать

Заголовки и фразы средней длины, где нужен бодрый, но читаемый вход. Для
коротких слов с явной «лесенкой» — `animata/bottom-up-letters`.

## Фразы из озвучки

- «представляем»
- «встречайте новую функцию»
- «коротко о главном»

## Визуальный стиль

Кинетичный, чистый, без размытия; 700 мс, `cubic-bezier(0.2,0.8,0.2,1)`.

## Входные данные

`text?: string | string[]`, `enter?`, `exit?`, `speed?`, `holdMs?`, `gapMs?`,
`yTravel?`, `className?`. Спека: `per-character`; enter 700 / 24, from
`{opacity 0, yPx 32}`; exit 420 / 14, to `{opacity 0, yPx −24}`; swap
`sequential`.

## Анимации

Посимвольный stagger: opacity + translateY.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/per-character-rise.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/per-character-rise.mdx` — документация
- `templates/react-libriry/animata/animata/text/per-character-rise.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

Рецепт «TextAnimator → кадр» в `compatibility/animata-text-graphs-cards.md`.

## Паттерны

`key-point-emphasis`, `growth-decline`
