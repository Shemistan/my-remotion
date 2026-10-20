# Meteors — `magicui/meteors`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Метеоритный дождь: маленькие светящиеся точки с хвостами пролетают по
диагонали сверху вниз и гаснут.

## Когда использовать

Фон для космоса, «звёздного» момента, желаний, скорости идей; лёгкая
динамика в тёмной карточке. Для частиц-«пыли» — `particles`.

## Фразы из озвучки

- «загадайте желание»
- «идеи падают как метеориты»
- «звёздный час нашей команды»

## Визуальный стиль

Точка 2 px `zinc-500` + хвост 50 px градиентом, угол 215°;
длительность 2–10 с, тонко, на тёмном фоне.

## Входные данные

- `number?` = `20`, `minDelay?` = `0.2`, `maxDelay?` = `1.2` (с)
- `minDuration?` = `2`, `maxDuration?` = `10` (с), `angle?` = `215`
- `className?`

## Анимации

Стили генерируются в `useEffect`: `left` = `Math.random() ·
window.innerWidth` px, случайные `animationDelay`/`animationDuration`;
класс `animate-meteor` → `@keyframes meteor`: `rotate(var(--angle))
translateX(0 → -500px)`, opacity 1 → 0 после 70 %, `linear infinite`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/meteors.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/registry/registry-ui.ts` — `@keyframes meteor`
- `templates/react-libriry/magicui/apps/www/content/docs/components/meteors.mdx` — документация

## Зависимости

React, Tailwind v4, `cn`.

## Совместимость и адаптация

`adaptable`. Параметры через `random(\`meteor-${i}\`)` синхронно (не в
`useEffect`), ширина из `useVideoConfig()`. Каждому метеору
`animationDelay: \`${delay_i - frame/fps}s\`` + `animationPlayState:
'paused'`, либо считать `translateX = -500·p`, `opacity` из фазы `p =
((t - delay) % dur)/dur`.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
