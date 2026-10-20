# Glitch In (bit) — `remotion-bits/bit-glitch-in`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Надпись «SYSTEM ONLINE» проявляется из случайных символов: за 45 кадров
шум уходит, в конце остаётся короткий сбой, затем текст стабилизируется.
Одновременно растёт opacity.

## Когда использовать

Эффектный вход заголовка в техно-ролике: запуск продукта, «взлом»,
расшифровка, ИИ. Если фраз несколько, бери `bit-glitch-cycle`.

## Фразы из озвучки

- «система в сети»
- «сигнал расшифрован»
- «код взломан»

## Визуальный стиль

Моноширинный шрифт, цифровой шум, резкий техно-вход. 90 кадров, 1920×1080.

## Входные данные

Props нет. В `transition`: `glitch [1, 0, 0.05, 0]`, `duration 45`,
`opacity [0,1]`, `frames [0, 45]`. В файле импортированы `useMemo`,
`AbsoluteFill` и `useViewportRect`, но они не используются.

## Анимации

Доля подменённых символов идёт 1 → 0 → 0.05 → 0, параллельно opacity
0 → 1. Подмены детерминированы через `random(seed + frame)`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/animated-text/GlitchIn.tsx` — сцена
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/glitch-in.mdx` — документация
- карточка компонента: `components/remotion-bits/animated-text.md`

## Зависимости

`remotion-bits` (`AnimatedText`).

## Совместимость и адаптация

`native`. Текст и стиль вынести в props, неиспользуемые импорты убрать.

## Паттерны

`key-point-emphasis`, `transformation`
