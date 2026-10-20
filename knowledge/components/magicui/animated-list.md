# AnimatedList — `magicui/animated-list`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `engine:motion`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Лента уведомлений: новые карточки по одной «выпрыгивают» сверху с
пружинным увеличением, старые плавно сдвигаются вниз.

## Когда использовать

Поток событий: заказы, сообщения, оплаты, алерты, «пока вы смотрите,
пришло ещё N». Для статичного перечня — `blur-fade`/`text-animate`.

## Фразы из озвучки

- «новые заказы приходят каждую минуту»
- «вам пишут клиенты»
- «система сразу сообщает о каждом событии»

## Визуальный стиль

Колонка `gap-4`, элементы `scale 0 → 1` от верха (`originY 0`), пружина
stiffness 350 / damping 40; задержка 1 с между карточками.

## Входные данные

- `AnimatedList`: `children` (обязательны, нужны `key`), `delay?` = `1000` (мс), `className?`
- `AnimatedListItem`: `children` (обёртка с анимацией, используется внутри).

## Анимации

`setTimeout(delay)` увеличивает индекс до `n-1`; показывается
`children.slice(0, index+1).reverse()`; `AnimatePresence` + `motion.div`
`initial {scale 0, opacity 0}` → `animate {scale 1, opacity 1}`,
`layout` (FLIP-сдвиг соседей с измерением DOM).

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/animated-list.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/animated-list.mdx` — документация
- `templates/react-libriry/magicui/apps/www/registry/example/animated-list-demo.tsx` — пример (уведомления)

## Зависимости

`motion` (`AnimatePresence`, `motion.div`, `layout`), `cn`.

## Совместимость и адаптация

`adaptable`. Индекс `= min(n-1, floor(frame / (delay/1000·fps)))`;
новая карточка — `spring({frame: frame - start_i, fps, config:
{stiffness: 350, damping: 40}})` для scale/opacity; сдвиг вниз вместо
`layout` — `translateY` = сумма высот (+gap) появившихся позже карточек
× их spring-прогресс (высоты задать фиксированно). `setTimeout`,
`AnimatePresence`, `layout` убрать.

## Паттерны

`sequence-steps`, `timeline`, `quantities`
