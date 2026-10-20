# OnlyLogo (атом-логотип) — `remotion-boilerplate/only-logo`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-boilerplate` (`templates/remotion-components/remotion-boilerplate`) |
| Вид | template |
| Категория | `icons-shapes` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | UNLICENSED (package.json, README); файла LICENSE нет — только референс идей |

## Что визуализирует

Логотип-«атом»: три эллиптические орбиты с градиентной обводкой
прорисовываются и разворачиваются на 30°/90°/−30°, в центре вырастает
градиентное ядро; весь знак увеличивается и медленно поворачивается на 360°
за длительность композиции. Это вариант логотипа из стандартного
Remotion-шаблона.

## Когда использовать

Референс: заставка/водяной знак, «наука», «технологии», «ядро системы».
Код брать нельзя (нет лицензии) — рисовать свой SVG по тому же приёму
(stroke-dashoffset + spring).

## Фразы из озвучки

- «в основе всего — одно ядро»
- «наука и технологии вместе»
- «всё вращается вокруг пользователя»

## Визуальный стиль

Градиент `#91dAE2` → `#86A8E7` (props), обводка 30 px, эллипсы 135×300 px
вокруг центра 960×540, прозрачный фон. 1920×1080, 30 fps, 150 кадров.

## Входные данные

zod `logoSchema`: `logoColor1`, `logoColor2: zColor()`; дефолты в Root
`#91dAE2`, `#86A8E7`. `ONLY_LOGO_DURATION = 150`. Внутренние `Arc {progress,
rotation, rotateProgress, color1, color2}`, `Atom {scale, color1, color2}`.

## Анимации

`spring({damping:100, mass:0.5})` → прорисовка дуг (`strokeDashoffset`) и
поворот дуг; `spring({mass:0.5})` → scale всего знака; `interpolate(frame,
[0, duration], [0, 360])` → вращение.

## Исходники и документация

- `templates/remotion-components/remotion-boilerplate/src/components/transitions/Logo.tsx`
- `templates/remotion-components/remotion-boilerplate/src/components/logo/Arc.tsx`
- `templates/remotion-components/remotion-boilerplate/src/components/logo/Atom.tsx`

## Зависимости

`remotion` (`spring`, `interpolate`, `random`), `@remotion/zod-types`, `zod`.

## Совместимость и адаптация

`native`. id градиентов — `random(null)` в `useState` (недетерминированно,
но влияет только на id). Координаты центра зашиты под 1920×1080.
UNLICENSED: без явной лицензии переиспользование кода юридически не
разрешено — только как референс идей.

## Паттерны

`abstract-concepts`, `system-structure`
