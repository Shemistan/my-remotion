# Ink Spread — `free-remotion-templates/ink-spread-transition`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `transitions-scene` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

«Чернильный» переход в японском стиле: 7 капель и 10 брызг цвета второй
сцены растекаются по странице, сливаясь в одно пятно с рваным краем, после
чего проявляется подпись второй сцены с сужающимся трекингом.

## Когда использовать

Мягкая художественная смена темы: история, культура, «а дальше всё
изменилось». Самодостаточная демо-композиция: сцены — цвет + подпись. Для
монтажа вынести сцены в `children` или оформить как `TransitionPresentation`
(SVG-маска из капель над входящей сценой).

## Фразы из озвучки

- «постепенно всё изменилось»
- «идея расползлась по всей компании»
- «перевернём страницу истории»

## Визуальный стиль

Бумага `#f5f1e8` → тушь `#1a1a1a`, подпись 220 px weight 800. Органичный,
рукотворный. 1920×1080, 120 кадров; шрифт `-apple-system, "Segoe UI", Roboto, sans-serif`.

## Входные данные

`InkSpreadTransitionProps`: `colorBefore` (`#f5f1e8`), `colorAfter`
(`#1a1a1a`), `labelBefore` («Before»), `labelAfter` («After»), `textColor`
(`#1a1a1a`).

## Анимации

Прогресс чернил кадры 14–60 `Easing.inOut(ease)`; капли с детерминированными
позициями/задержками (`seededRandom` — sin-хэш) растут по `1-(1-p)^2.2`;
SVG-фильтры `ink-bleed`/`ink-core`: blur → альфа-порог (`feColorMatrix`) →
`feTurbulence` + `feDisplacementMap` (seed фиксирован) → feather. Подпись
кадры 36–58 opacity, letterSpacing 34→16.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/ink-spread-transition/InkSpreadTransition.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion` (`interpolate`, `Easing`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`: всё от кадра, шум с фиксированным seed. Учесть: тяжёлые
SVG-фильтры на весь кадр (медленный рендер); фиксированные id фильтров —
два экземпляра в одном кадре конфликтуют, нужен уникальный суффикс; тайминги
зашиты в кадрах.

## Паттерны

`transformation`, `abstract-concepts`
