# FocusBlurResolve — `animata/focus-blur-resolve`

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

Строка «наводится на резкость»: из сильного размытия (14px) и сдвига 14px
снизу проявляется в чёткий текст, затем мягко расфокусируется вверх.

## Когда использовать

Момент прояснения: «становится понятно», вывод, ключевой тезис. Как «камера
фокусируется». Для посимвольного варианта — `animata/soft-blur-in`.

## Фразы из озвучки

- «и тут всё становится ясно»
- «главное — вот это»
- «фокус на результате»

## Визуальный стиль

Кинематографичный, медленный (760 мс вход), без цвета — через `className`.

## Входные данные

`text?: string | string[]`, `enter?`, `exit?`, `speed?` (0.72), `holdMs?`
(550), `gapMs?` (320), `yTravel?` (0.58), `className?`. Спека: `whole`; enter
760 / `cubic-bezier(0.22,1,0.36,1)`, from `{opacity 0, yPx 14, blurPx 14,
scale 1.01}`; exit 520 / `cubic-bezier(0.64,0,0.78,0)`, to `{opacity 0, yPx −10,
blurPx 10}`; `microDelayMs 35`.

## Анимации

Один юнит: blur 14→0, opacity, translateY, scale.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/focus-blur-resolve.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/focus-blur-resolve.mdx` — документация
- `templates/react-libriry/animata/animata/text/focus-blur-resolve.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

WAAPI-runtime с таймерами; рецепт «TextAnimator → кадр» в
`compatibility/animata-text-graphs-cards.md`. `filter: blur` дорог при
рендере — для 4K проверять время кадра.

## Паттерны

`key-point-emphasis`, `abstract-concepts`, `transformation`
