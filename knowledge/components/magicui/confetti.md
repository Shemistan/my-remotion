# Confetti — `magicui/confetti`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `engine:other`, `user-events`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Взрыв разноцветного конфетти на canvas: кусочки вылетают веером,
кувыркаются и падают под гравитацией. Есть кнопка `ConfettiButton`,
стреляющая из своего центра.

## Когда использовать

Праздник и успех: запуск, достижение цели, «поздравляем», итог. Не
для фоновой атмосферы — это короткий всплеск.

## Фразы из озвучки

- «поздравляем, цель достигнута!»
- «мы запустились!»
- «миллион пользователей — ура!»

## Визуальный стиль

Классическое `canvas-confetti`: яркие прямоугольники/круги, физика
разлёта и падения; праздничный, энергичный.

## Входные данные

`Confetti` (forwardRef `ConfettiRef { fire(opts?) }`):
- `options?: ConfettiOptions` (параметры `canvas-confetti`)
- `globalOptions?` = `{ resize: true, useWorker: true }`
- `manualstart?` = `false` (иначе `fire()` при монтировании)
- `children?`, `className`, атрибуты `canvas`.
`ConfettiButton`: `options?` + props `Button` из shadcn.

## Анимации

Полностью внутри `canvas-confetti`: `confetti.create(canvas, {useWorker})`
→ физика частиц в своём цикле (по сведениям о пакете — rAF/worker;
исходника пакета в репозитории нет). Компонент только вызывает `fire`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/confetti.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/confetti.mdx` — документация

## Зависимости

`canvas-confetti`, `@types/canvas-confetti`, shadcn `button`.

## Совместимость и адаптация

`complex`: время и случайность принадлежат стороннему движку, кадр
не задаётся. Для видео — свой детерминированный конфетти: N частиц с
`random(seed)` (скорость, угол, цвет, вращение), позиция по формуле
баллистики `p0 + v·t + g·t²/2` от кадра выстрела, рисование в SVG/
canvas по `useCurrentFrame()`.

## Паттерны

`key-point-emphasis`, `cause-effect`
