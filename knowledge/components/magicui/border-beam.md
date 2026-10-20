# BorderBeam — `magicui/border-beam`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Светящийся градиентный отрезок, бегущий по периметру рамки карточки
(видим только в полосе бордера) — «луч по контуру».

## Когда использовать

Выделить карточку, тариф, окно, кнопку как «активное/рекомендованное»;
показать, что процесс идёт. Слой внутри `relative`-контейнера.

## Фразы из озвучки

- «рекомендуем именно этот вариант»
- «процесс уже запущен»
- «всё внимание — сюда»

## Визуальный стиль

Градиент `#ffaa40 → #9c40ff → transparent`, размер 50 px, бордер
1 px; линейный обход за 6 с. Тех-премиум.

## Входные данные

- `size?` = `50`, `duration?` = `6` (с), `delay?` = `0` (с)
- `colorFrom?` = `"#ffaa40"`, `colorTo?` = `"#9c40ff"`
- `transition?: Transition`, `className?`, `style?`
- `reverse?` = `false`, `initialOffset?` = `0` (0–100), `borderWidth?` = `1`

## Анимации

Внешний `div` — маска только по `border-box` (mask-intersect).
Внутри `motion.div` с `offsetPath: rect(0 auto auto 0 round size px)`,
`offsetDistance: initial% → 100+initial%`, `repeat: Infinity, ease:
"linear", delay: -delay`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/border-beam.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/border-beam.mdx` — документация

## Зависимости

`motion`, Tailwind v4 (`mask-intersect`, `border-(length:…)`), `cn`.

## Совместимость и адаптация

`adaptable`. `motion.div` → `div` с `offsetDistance: \`${initial +
100·(((t + delay) / duration) % 1)}%\`` (для `reverse` — в обратную
сторону). Проверить поддержку `offset-path: rect()` в версии Chrome
рендера (свежая CSS-функция); запасной вариант — `offset-path:
path(...)` по размеру карточки.

## Паттерны

`key-point-emphasis`
