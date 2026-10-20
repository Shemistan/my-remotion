# AnimatedBeam — `animata/animated-beam`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Тёмно-индиго фон с сеткой тонких наклонных (rotate-12) линий через 40px; по
~30% линий сверху вниз пролетают светлые «метеорные» штрихи разной длины,
ширины и скорости. Поверх — контент `children`.

## Когда использовать

Фон для заголовка/hero «про технологии, скорость, поток данных». Не брать,
если нужен спокойный фон под плотный текст — штрихи отвлекают.

## Фразы из озвучки

- «данные летят со всех сторон»
- «скорость, с которой всё меняется»
- «добро пожаловать в будущее разработки»

## Визуальный стиль

Ночной техно: градиент indigo-900→indigo-950, мягкое радиальное свечение,
белые штрихи; ~30% быстрых (1.2–3.2 с), остальные медленные (6–14 с).

## Входные данные

`children: ReactNode` (обязателен), `className?: string`. Внутри: 64
«дорожки» по 40px, параметры штрихов из детерминированного `prand(n)`
(синус-хеш, не `Math.random`).

## Анимации

CSS `@keyframes meteor` (локальный `animated-beam.css`: translateY −20%→300%,
opacity 0→var(--opacity)→0) с `--duration`/`--delay` на каждом штрихе,
`infinite backwards`. Reduced-motion — штрихи скрыты.

## Исходники и документация

- `templates/react-libriry/animata/animata/background/animated-beam.tsx` — компонент
- `templates/react-libriry/animata/animata/background/animated-beam.css` — keyframes
- `templates/react-libriry/animata/content/docs/background/animated-beam.mdx` — документация
- `templates/react-libriry/animata/animata/background/animated-beam.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn` = clsx + tailwind-merge), Tailwind v4.

## Совместимость и адаптация

`adaptable`: React-разметка детерминирована, двигает только CSS. Вариант 1 —
оставить keyframes, а каждому штриху задать
`animationDelay: -(frame/fps - delay)s` и `animationPlayState: 'paused'`.
Вариант 2 — считать translateY/opacity штриха из `(frame/fps + delay) %
duration` через `interpolate`. Класс `full-content` — служебный для сайта.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
