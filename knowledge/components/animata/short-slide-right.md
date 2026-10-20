# ShortSlideRight — `animata/short-slide-right`

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

Вся фраза одним куском въезжает слева (−24px, лёгкий blur), а слова внутри
неё проявляются по очереди только прозрачностью.

## Когда использовать

Короткий лозунг из 3–5 слов, где важно чтение слева направо. Для
по-словного сдвига — `animata/per-word-crossfade`.

## Фразы из озвучки

- «одно движение — три слова»
- «просто, быстро, удобно»
- «вот что мы предлагаем»

## Визуальный стиль

Аккуратный моушн-титр; 520 мс сдвиг, слово 210 мс, stagger 92.

## Входные данные

`text?: string | string[]`, `enter?`, `exit?`, `speed?`, `holdMs?`, `gapMs?`,
`yTravel?`, `className?`. Спека: `per-word`, `customRenderer:
"shared-slide-opacity-stage"`; enter 520 / 92, from `{xPx −24, blurPx 1.2}`;
exit 320, to `{opacity 0, xPx 12, blurPx 1}`; `build: {wordOpacityDurationMs
210, wordOpacityFrom 0, wordOpacityTo 1}`. Runtime: hold ≥ 380 мс, gap ≥ 180.

## Анимации

Заголовок целиком: translateX + blur; слова: opacity со stagger.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/short-slide-right.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — `runSharedSlideOpacityLoop`
- `templates/react-libriry/animata/content/docs/text/short-slide-right.mdx` — документация
- `templates/react-libriry/animata/animata/text/short-slide-right.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

Измерений нет — две независимые интерполяции (контейнер и слова) из
`frame`; см. рецепт «TextAnimator → кадр».

## Паттерны

`sequence-steps`, `key-point-emphasis`
