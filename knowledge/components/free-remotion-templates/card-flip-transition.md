# Card Flip — `free-remotion-templates/card-flip-transition`

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

Весь кадр как одна карточка переворачивается вокруг оси Y на 180°: спереди
сцена «до», на обороте сцена «после»; под карточкой — подсвеченная «сцена»
и контактная тень, которая сжимается, когда карточка встаёт ребром.

## Когда использовать

Переход «было → стало», «миф → факт», смена темы с ощущением «оборотной
стороны». Самодостаточная демо-композиция: стороны — цветной фон с
надписью. Для монтажа вынести стороны в `children`/props или переписать как
`TransitionPresentation` для `TransitionSeries`. Для простого сдвига — `slide-wipe`.

## Фразы из озвучки

- «а теперь посмотрим на обратную сторону»
- «было так — а стало вот так»
- «переворачиваем ситуацию»

## Визуальный стиль

Плоские цвета `#22223b` → `#9a8c98`, надпись 180 px weight 800 с тенью,
perspective 2200, фон `#14141f` с радиальной подсветкой. Спокойный,
«презентационный». 1920×1080, 120 кадров; шрифт `-apple-system, "Segoe UI", Roboto, sans-serif`.

## Входные данные

`CardFlipTransitionProps`: `colorBefore` (`#22223b`), `colorAfter`
(`#9a8c98`), `labelBefore` («Before»), `labelAfter` («After»), `textColor`
(`#ffffff`), `backdropColor?` (`#14141f`).

## Анимации

`rotateY` 0→180° на кадрах 30–75, `Easing.inOut(Easing.ease)`;
`backfaceVisibility: hidden`, `transformStyle: preserve-3d`; тень
`scaleX`/opacity от `|cos(угла)|`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/card-flip-transition/CardFlipTransition.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion` (`interpolate`, `Easing`, `useCurrentFrame`), `react`.

## Совместимость и адаптация

`native`: угол — функция кадра, CSS 3D-трансформации статичны на кадр.
Тайминг 30–75 зашит константами; при другой длительности перенастроить.

## Паттерны

`transformation`, `comparison`
