# WarpBackground — `magicui/warp-background`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Карточка/блок внутри 3D-туннеля: четыре стены из клеточной сетки
уходят в перспективу, по ним к центру летят цветные лучи-«кометы» —
эффект «варп-прыжка».

## Когда использовать

Фон для главного тезиса или продукта: скорость, прорыв, «переносимся в
будущее». Внутрь кладётся контент (`children`). Для спокойного фона —
`grid-pattern`/`dot-pattern`.

## Фразы из озвучки

- «на скорости света»
- «переносимся в будущее»
- «прорыв, которого ждали»

## Визуальный стиль

Тонкая сетка цвета `--border`, лучи HSL со случайным оттенком (80 %/
60 %) и градиентом в прозрачность; линейный полёт 3 с. Тех/sci-fi.

## Входные данные

- `children: ReactNode` (обязателен)
- `perspective?` = `100` (px), `beamsPerSide?` = `3`, `beamSize?` = `5` (% клетки)
- `beamDelayMax?` = `3`, `beamDelayMin?` = `0`, `beamDuration?` = `3` (с)
- `gridColor?` = `"var(--border)"`, `className`, атрибуты `div`.

## Анимации

Каждый `Beam` — `motion.div`: `y: 100cqmax → -100%`, `repeat:
Infinity, ease: "linear"`, `delay` случайный; оттенок и aspect-ratio —
`Math.random()` при каждом рендере. Стены — CSS 3D
(`rotateX(-90deg)`, `perspective`, container queries `cq*`).

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/warp-background.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/warp-background.mdx` — документация

## Зависимости

`motion`, Tailwind v4 (container queries `@container`, `cqmax`,
`transform-3d`, `perspective-*`), `cn`.

## Совместимость и адаптация

`adaptable`. `Math.random` → `random(\`beam-${side}-${i}\`)` (иначе луч
меняет цвет на каждом кадре); `motion.div` → `div` с `transform:
translate(-50%, Y)`, где `Y` = интерполяция `100cqmax → -100%` по
`((t - delay) % duration)/duration`. Проверить, что Chrome рендерит
container-query единицы в нужном размере композиции.

## Паттерны

`abstract-concepts`, `transformation`, `spatial`
