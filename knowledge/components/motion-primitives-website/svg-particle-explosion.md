# SvgParticleExplosion — `motion-primitives-website/svg-particle-explosion`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `svg`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Элементы SVG-иллюстрации разлетаются в стороны с поворотом и
уменьшением, затем с упругим «elastic» собираются обратно (в режиме
`inView` — стартуют разбросанными и собираются).

## Когда использовать

Сборка логотипа/иконки из осколков в интро, «разобрать проблему на
части», «всё встаёт на свои места».

## Фразы из озвучки

- «всё встаёт на свои места»
- «разберём задачу на составляющие»
- «из хаоса рождается порядок»

## Визуальный стиль

Разлёт `spread` 200 px, поворот ±180°, scale 0.3, opacity 0;
сборка `elastic.out(1, 0.5)`, stagger 0.03 с.

## Входные данные

`SvgParticleExplosionProps`: `children` (SVG-фигуры); `trigger?:
'hover'|'click'|'inView'` (`'hover'`); `spread?` (200); `duration?`
(0.8); `viewBox?`, `width?`, `height?`; `className?`.

## Анимации

explode: GSAP to `{x, y, rotation: random, opacity 0, scale 0.3}` за
`0.6*duration`, `power3.out`; reassemble: to нулей за `0.8*duration`,
`elastic.out`, stagger 0.03. Смещения — `Math.random()`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/svg/animated-svg.tsx` — компонент

## Зависимости

`gsap`, `gsap/ScrollTrigger`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: детей рендерить с индексом; смещения
`rx_i = (random(\`ex-${i}-x\`) - 0.5)*spread` и т.п.; сборка
`p_i = spring({frame: frame - s - 0.03*i*fps, fps, config: {damping: 8}})`
(аналог elastic) → `transform: translate(rx_i(1-p)px, ry_i(1-p)px) rotate(rot_i(1-p)deg) scale(0.3 + 0.7p)`,
`opacity: min(1, p)`; `transform-box: fill-box; transform-origin: center`
для SVG-элементов. GSAP и обработчики hover/click удалить.

## Паттерны

`transformation`, `cause-effect`, `system-structure`
