# Page Flip — `free-remotion-templates/flip-page-transition`

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

Перелистывание страницы книги: текущая страница приподнимается у корешка,
поворачивается на левом краю на 90° (с затенением к свободному краю) и
открывает следующую, которая слегка «оседает» по масштабу; на нижнюю
страницу падает тень.

## Когда использовать

«Следующая глава», «перевернём страницу», хронология по эпохам, сторителлинг.
Самодостаточная демо-композиция: страницы — цвет + подпись. Внутренняя
обёртка `FlipPage` (`mode: enter|exit`, `direction: left|right`, `delay`,
`duration`, `children`) уже принимает детей, но не экспортируется — для
монтажа вынести её или переписать как `TransitionPresentation`.

## Фразы из озвучки

- «перевернём страницу»
- «новая глава в истории компании»
- «а на следующей странице — самое интересное»

## Визуальный стиль

Кремовая бумага `#fefae0` и тёмно-зелёный `#283618`, подпись 180 px weight
800. Книжный, тёплый. 1920×1080, 120 кадров; шрифт `-apple-system, "Segoe UI", Roboto, sans-serif`.

## Входные данные

`FlipPageTransitionProps`: `colorBefore` (`#fefae0`), `colorAfter`
(`#283618`), `labelBefore` («Before»), `labelAfter` («After»), `textColor`
(`#283618`). Цвет подписи второй страницы инвертируется только для двух
зашитых hex (`#283618`, `#1a1a1a`).

## Анимации

`flipProgress`: предподъём 16 кадров (0→0.045), затем кадры 30–75
`Easing.inOut(ease)`; `rotateY` 0→90° с `transformOrigin: left center`,
perspective 1600; opacity гаснет при 72–90°; градиент-затенение и
отбрасываемая тень по прогрессу; «оседание» scale 1.035→1. Обёрнуто в `Sequence`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/flip-page-transition/FlipPageTransition.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion` (`interpolate`, `Easing`, `Sequence`, `useCurrentFrame`), `react`.

## Совместимость и адаптация

`native`, без `@keyframes`. Тайминги — константы; авто-инверсию цвета
текста заменить на явный prop.

## Паттерны

`timeline`, `sequence-steps`, `transformation`
