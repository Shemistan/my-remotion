# interpolate / Easing — `remotion-bits/interpolate`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Ничего не рисует; это собственный `interpolate` (совместимый по сигнатуре с
remotion) плюс набор easing-функций, `hold()` и пружина.

## Когда использовать

Когда нужен `interpolate` с немонотонным диапазоном (`[0, 1, 0]`),
повторами входа для «удержания» (`[0,30,30,600]`), с интерполяцией матриц
`Matrix4`/`Transform3D`, или easing по имени. Для обычных случаев хватает
`interpolate` из `remotion`.

## Фразы из озвучки

Косвенно — где движение должно «замереть» или вернуться:
- «цифра держится, а потом снова растёт»
- «маятник качнулся туда и обратно»
- «плавно, с пружинкой, встаёт на место»

## Входные данные

`interpolate(input, inputRange[], outputRange (number[] | Matrix4[] |
Transform3D[]), {extrapolateLeft/Right: 'clamp'|'extend'|'identity'
(по умолчанию 'extend'), easing?})`. `Easing`: `linear, easeIn, easeOut,
easeInOut, easeIn/Out/InOutQuad, …Cubic, …Sine, …Quart, spring`. `steps(n)`,
`spring({mass=1, stiffness=100, damping=10})` (аналитическая, по t∈0…1),
`hold(frames)`, тип `InterpolateValue`, `resolveInterpolateValue(value, frame)`.

## Анимации

Нет собственных; чистые функции.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/utils/interpolate.ts` — реализация
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/utils-interpolation.mdx` — справка

## Зависимости

`three` (Matrix4), внутренние `interpolate3d`, `transform3d`.

## Совместимость и адаптация

`native` (детерминированные функции). Отличие от remotion: по умолчанию
экстраполяция `extend`, а не clamp — для прогресса задавать `clamp` явно.
`Easing.spring` — не физическая `spring()` remotion, а функция от t∈0…1.

## Паттерны

нет
