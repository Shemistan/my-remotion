# BlurFade — `magicui/blur-fade`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Обёртка для любого содержимого (текст, картинка, карточка): элемент
проявляется из размытия с небольшим сдвигом. С разными `delay` даёт
каскадное появление группы.

## Когда использовать

Универсальный мягкий вход: галерея фото, строки текста, карточки по
очереди. Для посимвольной анимации текста — `text-animate`.

## Фразы из озвучки

- «посмотрим на несколько примеров»
- «вот как это выглядит»
- «шаг за шагом картина проясняется»

## Визуальный стиль

Мягкий, «дорогой»: blur 6px → 0, сдвиг 6px, 0.4 с easeOut.

## Входные данные

- `children`, `className?`
- `duration?` = `0.4` (с), `delay?` = `0` (+0.04 с внутри), `offset?` = `6` (px)
- `direction?: "up"|"down"|"left"|"right"` = `"down"`, `blur?` = `"6px"`
- `inView?` = `false`, `inViewMargin?` = `"-50px"`
- `variant?: {hidden:{y}, visible:{y}}`, прочие `MotionProps`.

## Анимации

`motion.div` variants `hidden {x|y: ±offset, opacity 0, blur}` →
`visible {0, 1, blur(0)}`, `transition {delay: 0.04+delay, duration,
ease: "easeOut"}`; при `inView` — запуск по `useInView`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/blur-fade.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/blur-fade.mdx` — документация

## Зависимости

`motion` (`motion.div`, `AnimatePresence`, `useInView`).

## Совместимость и адаптация

`adaptable`. `p = interpolate(frame, [s, s + 0.4·fps], [0, 1],
{easing: Easing.out(Easing.ease), extrapolate clamp})`, `s =
(0.04 + delay)·fps`; стиль `opacity: p`, `filter: blur(6·(1-p)px)`,
`translateY(-offset·(1-p))` для `down`. Обёртку `motion.div` → `div`.

## Паттерны

`sequence-steps`, `key-point-emphasis`
