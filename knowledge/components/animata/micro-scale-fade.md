# MicroScaleFade — `animata/micro-scale-fade`

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

Строка проявляется с крошечным «попом» масштаба 0.96 → 1 и так же
уходит; фразы меняются кросс-фейдом.

## Когда использовать

Подписи, лейблы, мелкие титры, где движение должно быть почти незаметным.
Для заметного масштаба — `animata/spring-scale-in`, `animata/shared-axis-z`.

## Фразы из озвучки

- «небольшое уточнение»
- «кстати»
- «подпись к слайду»

## Визуальный стиль

Тонкий премиальный полиш; 600/400 мс, `cubic-bezier(0.32,0.72,0,1)`.

## Входные данные

`text?: string | string[]`, `enter?`, `exit?`, `speed?`, `holdMs?`, `gapMs?`,
`yTravel?`, `className?`. Спека: `whole`; enter 600, from `{opacity 0, scale
0.96}`; exit 400 / `cubic-bezier(0.7,0,0.84,0)`, to `{opacity 0, scale 0.96}`;
swap `crossfade`, `overlapMs 0`.

## Анимации

Один юнит: opacity + scale.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/micro-scale-fade.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/micro-scale-fade.mdx` — документация
- `templates/react-libriry/animata/animata/text/micro-scale-fade.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

Рецепт «TextAnimator → кадр» в `compatibility/animata-text-graphs-cards.md`.

## Паттерны

`key-point-emphasis`
