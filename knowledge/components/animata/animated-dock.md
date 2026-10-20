# AnimatedDock — `animata/animated-dock`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | complex |
| Флаги | `engine:motion`, `user-events`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Док в стиле macOS: стеклянная полоса (backdrop-blur) с круглыми иконками;
иконки рядом с курсором плавно увеличиваются (40→80px), над наведённой
появляется подпись. На узких экранах — кнопка-меню с вертикальным
списком.

## Когда использовать

Mockup рабочего стола/приложений, «все инструменты под рукой», выбор
приложения. Без интеракции подходит как статичная панель.

## Фразы из озвучки

- «все инструменты в одном доке»
- «открываем нужное приложение»
- «ваш рабочий стол станет удобнее»

## Визуальный стиль

Полупрозрачный white/10, тонкая рамка, тени, иконки lucide/свои; мягкие
пружины (stiffness 150, damping 12).

## Входные данные

`items: {title: string; icon: ReactNode; href: string}[]` (обязателен),
`largeClassName?`, `smallClassName?`. Большой док виден с `md:`.

## Анимации

`motion/react`: `useMotionValue(mouseX)` → `useTransform` расстояния от
центра иконки (`getBoundingClientRect`) → размеры `[-150,0,150]→[40,80,40]`
→ `useSpring`; подсказка через `AnimatePresence`.

## Исходники и документация

- `templates/react-libriry/animata/animata/container/animated-dock.tsx` — компонент
- `templates/react-libriry/animata/content/docs/container/animated-dock.mdx` — документация
- `templates/react-libriry/animata/animata/container/animated-dock.stories.tsx` — пример

## Зависимости

`motion`, `lucide-react`, `next/link`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: увеличение — функция положения курсора, измеряемого по DOM.
Переписать: «виртуальный курсор» `x(frame)` (interpolate по иконкам),
размер иконки `i` = `interpolate(|x - center_i|, [0,150], [80,40],
clamp)`, центры — из индекса и шага, без DOM-измерений и пружин; подпись
показывать для ближайшей иконки. `next/link` → `div`.

## Паттерны

`sequence-steps`, `system-structure`
