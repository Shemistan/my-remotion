# LogoPreloader — `motion-primitives-website/logo-preloader`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `layout-templates` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Логотип/слово проявляется слева направо за вертикальной «сканирующей»
линией (маска `clip-path`), затем экран увеличивается и гаснет.

## Когда использовать

Интро и аутро бренда, раскрытие названия продукта, заставка ролика.

## Фразы из озвучки

- «представляем»
- «это — наш бренд»
- «запомните это имя»

## Визуальный стиль

`text-6xl font-bold text-white` на `bg-black`; линия 2 px белая;
кривая `[0.76, 0, 0.24, 1]`, 1 с; выход `scale 1.5`, `opacity 0`, 0.6 с.

## Входные данные

`LogoPreloaderProps`: `logo?: ReactNode` (по умолчанию текст
`'AWWWARDS'`); `className?`. Вызывает `usePreloader()` — нужен
`PreloaderProvider`, хотя `progress` не используется.

## Анимации

`clipPath inset(0 100% 0 0) → inset(0 0% 0 0)` и линия `left 0 → 100%`
синхронно (1 с); выход через `AnimatePresence`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/transitions/preloader.tsx` — компонент

## Зависимости

`framer-motion`, `react` (context), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `p = interpolate(frame, [0, fps], [0,1], {clamp, easing: Easing.bezier(0.76, 0, 0.24, 1)})`
→ `clipPath: inset(0 ${100*(1-p)}% 0 0)`, линия `left: ${100p}%`;
выход — `scale(1 + 0.5q)`, `opacity 1 - q` по второму прогрессу;
вызов `usePreloader` удалить; `fixed` → `AbsoluteFill`.

## Паттерны

`key-point-emphasis`, `transformation`
