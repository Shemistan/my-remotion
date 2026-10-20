# RetroGrid — `magicui/retro-grid`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `canvas`, `raf`, `dom`, `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Синтвейв-пол: сетка, уходящая в перспективу к горизонту и бесконечно
едущая на зрителя, сверху растворяется градиентом в фон.

## Когда использовать

Ретро/80-е, «путь вперёд», игры, заставки и титры. Для плоского фона —
`grid-pattern`, для туннеля — `warp-background`.

## Фразы из озвучки

- «назад в будущее»
- «дорога уходит за горизонт»
- «мы движемся только вперёд»

## Визуальный стиль

Серые линии (`lightLineColor`/`darkLineColor` = `"gray"`), угол 65°,
клетка 60 px, opacity 0.5; цикл 15 с; нижний градиент white/black.

## Входные данные

- `angle?` = `65` (1–89), `cellSize?` = `60`, `opacity?` = `0.5`
- `lightLineColor?` = `"gray"`, `darkLineColor?` = `"gray"`
- `className?`, `style?`, атрибуты `div`.

## Анимации

Основной путь — WebGL fragment shader (ray-plane, LOD, антиалиасинг),
сдвиг сетки `u_time · speed`, где `u_time = timestamp/1000` из
`requestAnimationFrame`. Fallback, пока WebGL не готов, — CSS:
`perspective: 200px` → `rotateX(angle)` → `@keyframes
retro-grid-fallback-scroll` (`translateY(-50% → 0)`, 15 с). Вокруг —
`ResizeObserver`, `IntersectionObserver`, `MutationObserver` темы,
`matchMedia`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/retro-grid.tsx` — компонент (шейдер и fallback внутри)
- `templates/react-libriry/magicui/apps/www/content/docs/components/retro-grid.mdx` — документация

## Зависимости

React, WebGL 1 + `OES_standard_derivatives`, `cn`.

## Совместимость и адаптация

`complex` из-за WebGL-цикла. Два пути: (1) передавать `u_time =
frame/fps` и вызывать `draw` в `useEffect([frame])` без rAF (шейдер —
чистая функция от `u_time`); нужен headless Chrome с WebGL (`--gl=angle`
/`swangle`). (2) Проще: взять только CSS-ветку fallback и задавать
`translateY(${-50 + 50·((t % 15)/15)}%)` по кадру — без WebGL.

## Паттерны

`spatial`, `timeline`, `abstract-concepts`
