# Globe — `magicui/globe`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `canvas`, `engine:other`, `engine:motion`, `user-events`, `dom`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Точечный 3D-глобус (WebGL), медленно вращающийся, с оранжевыми
маркерами городов и мягким свечением; тянется мышью.

## Когда использовать

Глобальность: «по всему миру», офисы/пользователи в разных странах,
доставка, сеть. Для плоской карты с маркерами — `dotted-map`.

## Фразы из озвучки

- «нам доверяют компании по всему миру»
- «пользователи в 120 странах»
- «доставка в любую точку планеты»

## Визуальный стиль

Белый «бумажный» шар (`baseColor [1,1,1]`, `dark 0`, `diffuse 0.4`,
16 000 точек), маркеры `[251,100,21]/255`, белый glow, наклон `theta
0.3`; вращение 0.005 рад за кадр браузера.

## Входные данные

- `className?`
- `config?: COBEOptions` = `GLOBE_CONFIG` (`width/height 800`,
  `devicePixelRatio 2`, `phi 0`, `theta 0.3`, `dark 0`, `diffuse 0.4`,
  `mapSamples 16000`, `mapBrightness 1.2`, `baseColor`, `markerColor`,
  `glowColor`, `markers: {location:[lat,lng], size}[]` — 10 городов).

## Анимации

`createGlobe(canvas, {..., onRender(state)})` из `cobe`: в своём
цикле рендера `phi += 0.005` (если нет перетаскивания), `state.phi =
phi + spring(r)`; drag меняет `r` через `useMotionValue`/`useSpring`.
Размер — `offsetWidth` + `resize`; появление `opacity` через
`setTimeout(0)` + CSS `transition 500ms`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/globe.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/globe.mdx` — документация
- `templates/react-libriry/magicui/apps/www/registry/example/globe-demo.tsx` — пример

## Зависимости

`cobe@^0.6.4` (WebGL), `motion`.

## Совместимость и адаптация

`complex`: цикл рендера принадлежит `cobe`, кадр Remotion он не ждёт.
Варианты: в `onRender` ставить `state.phi = phi0 + speed·frame`
(читать кадр из ref, обновляемого `useCurrentFrame`) и держать
`delayRender` до первого отрисованного кадра — но синхронизация
draw↔screenshot не гарантирована; нужен WebGL в headless Chrome.
Надёжнее — собственный шар на `@remotion/three` или SVG-проекция
точек (ортографическая) по кадру. Убрать drag, `setTimeout`,
`transition`.

## Паттерны

`spatial`, `quantities`
