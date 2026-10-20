# SoftBlurIn — `animata/soft-blur-in`

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

«Эппловский» вход заголовка: каждая буква проявляется из сильного
размытия (12px) с дрейфом 16px вверх, со stagger 25 мс.

## Когда использовать

Главный титр ролика, название продукта, торжественный момент. Для строки
целиком — `animata/focus-blur-resolve`.

## Фразы из озвучки

- «знакомьтесь»
- «представляем новинку»
- «это — …»

## Визуальный стиль

Премиальный, мягкий, медленный (900 мс на букву).

## Входные данные

`text?: string | string[]`, `enter?`, `exit?`, `speed?`, `holdMs?`, `gapMs?`,
`yTravel?`, `className?`. Спека: `per-character`; enter 900 / 25 /
`cubic-bezier(0.22,1,0.36,1)`, from `{opacity 0, yPx 16, blurPx 12}`; exit 600
/ 15, to `{opacity 0, yPx −16, blurPx 12}`; swap `sequential`.

## Анимации

Посимвольный stagger: opacity, translateY, blur.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/soft-blur-in.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/soft-blur-in.mdx` — документация
- `templates/react-libriry/animata/animata/text/soft-blur-in.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

Рецепт «TextAnimator → кадр» в `compatibility/animata-text-graphs-cards.md`.
Много элементов с `filter: blur` — следить за временем рендера кадра.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
