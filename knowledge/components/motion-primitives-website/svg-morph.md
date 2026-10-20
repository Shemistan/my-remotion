# SvgMorph — `motion-primitives-website/svg-morph`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `icons-shapes` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `svg`, `timers`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Одна SVG-фигура, плавно перетекающая в следующую из списка (круг →
звезда → сердце…), по таймеру, hover, клику или скроллу.

## Когда использовать

Трансформация понятия («идея → продукт»), смена иконок-состояний,
абстрактная живая форма. Работает корректно только если у путей
одинаковая структура команд (одинаковое число чисел).

## Фразы из озвучки

- «одна форма превращается в другую»
- «из простого — в сложное»
- «так меняется продукт со временем»

## Визуальный стиль

Одна `path`, `fill="currentColor"` по умолчанию, `viewBox 0 0 100 100`;
`power2.inOut`, 0.8 с.

## Входные данные

`SvgMorphProps`: `paths: string[]`; `trigger?: 'hover'|'click'|'auto'|
'scroll'` (`'auto'`); `duration?` (0.8); `ease?`; `autoInterval?` (3000,
мс); `fill?` (`'currentColor'`); `stroke?`; `strokeWidth?`; `viewBox?`;
`width?`, `height?`; `className?`.

## Анимации

`interpolatePath(from, to, t)` — линейная интерполяция всех чисел в
строке `d` по шаблону более длинного пути; t — GSAP-tween, `setInterval`
в режиме auto.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/svg/animated-svg.tsx` — компонент

## Зависимости

`gsap`, `gsap/ScrollTrigger`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `interpolatePath` — чистая функция, перенести как есть.
`period = autoInterval/1000*fps`, `k = floor(frame/period)`,
`t = interpolate(frame % period, [0, duration*fps], [0,1], {clamp, easing: Easing.inOut(Easing.quad)})`,
`d = interpolatePath(paths[k % n], paths[(k+1) % n], t)` в рендере.
`setAttribute`, GSAP и `setInterval` удалить. Для несовместимых путей —
`flubber`/`@remotion/paths` (`interpolatePath`).

## Паттерны

`transformation`, `abstract-concepts`
