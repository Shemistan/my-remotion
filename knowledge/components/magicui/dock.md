# Dock / DockIcon — `magicui/dock`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `engine:motion`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Док в стиле macOS: стеклянная панель с круглыми иконками; иконки под
курсором и рядом пружинисто увеличиваются («линза»).

## Когда использовать

Имитация рабочего стола/ОС, «все приложения под рукой», навигация по
продуктам экосистемы; в видео — с виртуальным курсором, проезжающим
по доку. Без курсора — статичная панель иконок.

## Фразы из озвучки

- «все ваши инструменты — в одном доке»
- «открываем нужное приложение»
- «привычно, как на Mac»

## Визуальный стиль

Высота 58 px, `rounded-2xl`, border, `backdrop-blur-md`, фон
`white/10`/`black/10`; иконки 40 → 60 px, зона влияния 140 px,
пружина mass 0.1 / stiffness 150 / damping 12.

## Входные данные

- `Dock`: `children` (`DockIcon`), `className?`, `iconSize?` = `40`,
  `iconMagnification?` = `60`, `disableMagnification?` = `false`,
  `iconDistance?` = `140`, `direction?: "top"|"middle"|"bottom"` = `"middle"`
- `DockIcon`: `size`, `magnification`, `distance`, `mouseX` (проставляет Dock), `className`, `children`

## Анимации

`onMouseMove` → `mouseX`; у иконки `distance = mouseX - центр
(getBoundingClientRect)`, `useTransform([-d, 0, d] → [size, mag,
size])` → `useSpring` → `width/height`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/dock.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/dock.mdx` — документация

## Зависимости

`motion`, `class-variance-authority`, `cn`.

## Совместимость и адаптация

`adaptable`. Заменить `mouseX` координатой виртуального курсора из
кадра, центры иконок считать аналитически (`i·(size+gap)`) вместо
`getBoundingClientRect`, размер — `interpolate(|x - c_i|, [0, d],
[mag, size], clamp)`; пружину (если нужна) — `spring()` по кадру.

## Паттерны

`spatial`, `key-point-emphasis`
