# Slide Wipe — `free-remotion-templates/slide-wipe`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `transitions-scene` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Классический горизонтальный «пуш»: сцена «до» уезжает влево, сцена «после»
въезжает справа, края страниц всё время стыкуются.

## Когда использовать

Нейтральная смена слайда или пункта, «далее», «следующий шаг». Самодостаточная
демо-композиция: страницы — цвет + подпись. В монтаже проще взять готовый
`slide()` из `@remotion/transitions` в `TransitionSeries`; этот шаблон —
референс тайминга. Для акцентной смены — `whip-pan` или `transition-circle-wipe`.

## Фразы из озвучки

- «переходим к следующему пункту»
- «двигаемся дальше»
- «а вот что было потом»

## Визуальный стиль

Насыщенный синий `#0d4f8b` → жёлтый `#ffb703`, подпись ~16.6 % высоты кадра
(≈180 px), weight 800 с тенью. Простой, корпоративный. 1920×1080, 120 кадров;
шрифт `-apple-system, "Segoe UI", Roboto, sans-serif`.

## Входные данные

`SlideWipeProps`: `colorBefore` (`#0d4f8b`), `colorAfter` (`#ffb703`),
`labelBefore` («Before»), `labelAfter` («After»), `textColor` (`#ffffff`),
`backdropColor?` (`#0a1626`).

## Анимации

Прогресс кадры 30–75 `Easing.inOut(ease)`; `translateX` уходящей
`-progress·100%`, входящей `(1-progress)·100%`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/slide-wipe/SlideWipe.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion` (`interpolate`, `Easing`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`. Вынести `PageLayer` в `children`, тайминг 30/45 — в props.

## Паттерны

`sequence-steps`, `comparison`
