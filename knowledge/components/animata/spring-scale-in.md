# SpringScaleIn — `animata/spring-scale-in`

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

Слова «выпрыгивают» с небольшим перелётом масштаба (0.7 → 1 с overshoot
`cubic-bezier(0.34,1.56,0.64,1)`), stagger 95 мс.

## Когда использовать

Игривые, энергичные фразы: призыв к действию, радостная новость, перечень
выгод. Не для серьёзных тем.

## Фразы из озвучки

- «и это ещё не всё!»
- «бесплатно, быстро, весело»
- «попробуйте прямо сейчас»

## Визуальный стиль

Игривый, пружинистый, быстрый (360 мс на слово).

## Входные данные

`text?: string | string[]`, `enter?`, `exit?`, `speed?`, `holdMs?`, `gapMs?`,
`yTravel?`, `className?`. Спека: `per-word`; enter 360 / 95, from `{opacity 0,
scale 0.7}`; exit 200 / 80, to `{opacity 0, scale 0.8}`; swap `crossfade`,
`microDelayMs 35`.

## Анимации

Stagger по словам: scale с overshoot + opacity.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/spring-scale-in.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/spring-scale-in.mdx` — документация
- `templates/react-libriry/animata/animata/text/spring-scale-in.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

Рецепт «TextAnimator → кадр»; overshoot воспроизводится тем же
`Easing.bezier(0.34,1.56,0.64,1)` (или `spring()` из remotion).

## Паттерны

`key-point-emphasis`, `sequence-steps`
