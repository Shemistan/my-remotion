# 3D Elements Scene (bit) — `remotion-bits/bit-3d-elements`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `3d-camera` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Камера летит по фразе «Fly Your Camera Through Space»: каждое слово — шаг,
повёрнутый на −30° относительно предыдущего; вокруг в глубине рассыпаны 20
полупрозрачных цветных фигур (круги, треугольники, ромбы).

## Когда использовать

Динамичная подача слогана по словам с ощущением полёта в пространстве;
интро, переход к теме «космос/масштаб». Для статичного появления слов —
`bit-word-by-word`.

## Фразы из озвучки

- «отправляйтесь в путешествие по данным»
- «каждое слово имеет вес»
- «мир вокруг нас полон идей»

## Визуальный стиль

Крупный белый/наследуемый текст (8 vmin), разноцветные HSL-фигуры с
opacity 0.2, лёгкий «космический» фон; 200 кадров, 1920×1080.

## Входные данные

Без props: `words` (5 слов) зашиты; фигуры строятся в `useMemo` с
`randomFloat`/`anyElement` по seed (позиции на сетке 2 vmin, размеры 16/32
vmin, цвет hsl). Для переиспользования вынести слова и число фигур.

## Анимации

`Scene3D` (`transitionDuration` 20, `stepDuration` 20, `easeInOut`); слово
входит `StaggeredMotion` y 15 vmin→0, opacity 0→1 за 15 кадров; выход шага
opacity 1→0 за 15; фигуры — `Element3D` с `StaggeredMotion` opacity 0→0.2.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/scene-3d/3DElements.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/3d-elements.mdx` — документация

## Зависимости

`remotion-bits` (`Scene3D`, `Step`, `Element3D`, `StaggeredMotion`,
`useViewportRect`, `randomFloat`, `anyElement`; `StepResponsive` импортирован,
не используется). См. `remotion-bits/scene-3d`, `remotion-bits/element-3d`.

## Совместимость и адаптация

`native`, случайность детерминирована seed'ами. `metadata.name` ошибочно
«Basic 3D Scene» (копия из 3DBasic); `registry.name` верный.

## Паттерны

`spatial`, `key-point-emphasis`, `abstract-concepts`
