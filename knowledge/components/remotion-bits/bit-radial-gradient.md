# Radial Gradient Transition (bit) — `remotion-bits/bit-radial-gradient`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Круглое световое пятно перемещается из левого верхнего угла (20% 20%) в
правый нижний (80% 80%) и меняет цвет: солнечно-жёлтое на голубом
(`#FDB813 → #78C0E0`) становится закатно-розовым на тёмно-фиолетовом
(`#F5576C → #2F2044`).

## Когда использовать

«Солнце садится», течение дня, смена настроения от бодрого к вечернему,
фон для перехода между темами. Для вращения — `bit-conic-gradient`.

## Фразы из озвучки

- «день подходит к концу»
- «настроение постепенно меняется»
- «свет перемещается»

## Визуальный стиль

Тёплая, «закатная» палитра, мягкое пятно; 90 кадров, 1920×1080, linear.

## Входные данные

Без props: `gradient` зашит — `radial-gradient(circle at 20% 20%, #FDB813 0%,
#78C0E0 60%)` → `radial-gradient(circle at 80% 80%, #F5576C 0%, #2F2044
100%)`, `duration={90}`.

## Анимации

`GradientTransition`: центр интерполируется в процентах, позиции стопов
60%→100%, цвета в oklch.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/gradient-transition/RadialGradient.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/radial-gradient.mdx` — документация

## Зависимости

`remotion-bits` (`GradientTransition`); registry: `gradient-transition`.
Карточка компонента — `gradient-transition.md`.

## Совместимость и адаптация

`native`. Вынести цвета/позиции в props. Позиция «at …» должна быть в
процентах или ключевых словах — так её понимает парсер.

## Паттерны

`transformation`, `timeline`, `abstract-concepts`
