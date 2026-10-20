# Conic Gradient Rotation (bit) — `remotion-bits/bit-conic-gradient`

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

Полноэкранный конический градиент (чёрный → зелёный `#009900`), который
равномерно проворачивается на полный круг: луч света обходит экран, как
стрелка радара.

## Когда использовать

Фон для «сканирования», ожидания, отсчёта времени, техно-заставки. Для
спокойной смены цвета — `bit-linear-gradient`, для «смещения света» —
`bit-radial-gradient`.

## Фразы из озвучки

- «система сканирует всю сеть»
- «время идёт»
- «радар засёк новую цель»

## Визуальный стиль

Тёмный, двухцветный, «радарный»; линейная скорость без ускорений. 60 кадров,
1920×1080.

## Входные данные

Без props: `gradient` зашит — `conic-gradient(from 0deg, #000000, #009900)` →
`conic-gradient(from 359deg, …)`; `easing="linear"`, `shortestAngle={false}`
(иначе 0→359 пошло бы на −1°), `duration={60}`. Цвета и длительность
выносить в props при переиспользовании.

## Анимации

`GradientTransition`: угол `from` интерполируется 0→359° за 60 кадров;
цвета стопов не меняются.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/gradient-transition/ConicGradient.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/conic-gradient.mdx` — документация

## Зависимости

`remotion-bits` (`GradientTransition`); registry: `gradient-transition`.
Карточка компонента — `gradient-transition.md`.

## Совместимость и адаптация

`native`. Для бесшовной петли длиннее 60 кадров — повторять в `<Loop>` или
задать угол 0→360·N. Шов на 359→0 при зацикливании практически незаметен.

## Паттерны

`timeline`, `abstract-concepts`
