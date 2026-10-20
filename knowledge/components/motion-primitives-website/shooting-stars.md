# ShootingStars — `motion-primitives-website/shooting-stars`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `dom`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Одиночная падающая звезда — короткий штрих с градиентным хвостом
(фиолетовый → бирюзовый), пролетающий под 45° из случайной точки верхней
трети экрана; появляется раз в 1.2–4.2 с.

## Когда использовать

Минималистичный ночной фон, редкий акцент «вспышка идеи»; спокойнее, чем
`meteors` (одна звезда в кадре).

## Фразы из озвучки

- «и вдруг — озарение»
- «редкий шанс, который нельзя упустить»
- «звезда на нашем небосклоне»

## Визуальный стиль

SVG `rect` 10×1 с `linearGradient` (`trailColor` `#2EB9DF` прозрачный →
`starColor` `#9E00FF`), угол 45°.

## Входные данные

`ShootingStarsProps`: `minSpeed?` (10), `maxSpeed?` (30) — px за тик
16 мс; `minDelay?` (1200), `maxDelay?` (4200) — мс; `starColor?`;
`trailColor?`; `starWidth?` (10); `starHeight?` (1); `className?`.

## Анимации

`setInterval(createStar, random(minDelay, maxDelay))`; внутри
`setInterval(moveStar, 16)` прибавляет `speed` к `distance`; позиция по
`window.innerWidth/innerHeight`; звезда удаляется по `setTimeout`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/meteors.tsx` — компонент

## Зависимости

`react`, `@/lib/utils` (`random` = `Math.random`).

## Совместимость и адаптация

`adaptable`: расписание детерминировать: звезда `k` стартует в
`t_k = Σ random(\`ss-gap-${j}\`)` (в диапазоне задержек), живёт
`random(\`ss-life-${k}\`)`; позиция
`distance = speed_k * (frame/fps - t_k) * 62.5` (16 мс-тики),
`x0, y0` из `random(seed)` и `useVideoConfig().width/height` вместо
`window`. Таймеры и `Date.now()` (id градиента) удалить, id — от `k`.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
