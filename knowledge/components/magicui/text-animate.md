# TextAnimate — `magicui/text-animate`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Текст появляется по частям — целиком, по словам, символам или строкам —
одним из 10 пресетов: fade, blur, slide в 4 стороны, scale up/down; со
stagger между сегментами.

## Когда использовать

Базовый «рабочий» вход заголовков, подзаголовков и тезисов. Пресеты
дают разный характер: `blurInUp` — мягко, `scaleUp` — энергично,
`slideLeft` — повествовательно.

## Фразы из озвучки

- «давайте разберёмся по порядку»
- «три слова: быстро, просто, надёжно»
- «итак, наш главный вывод»

## Визуальный стиль

Нейтральный (`whitespace-pre-wrap`), характер задаёт пресет; 0.3 с на
сегмент, stagger `duration / segments.length`.

## Входные данные

- `children: string` (обязателен)
- `by?: "text"|"word"|"character"|"line"` = `"word"`
- `animation?: "fadeIn"|"blurIn"|"blurInUp"|"blurInDown"|"slideUp"|"slideDown"|"slideLeft"|"slideRight"|"scaleUp"|"scaleDown"` = `"fadeIn"`
- `delay?` = `0`, `duration?` = `0.3` (с), `variants?: Variants`
- `as?` = `"p"`, `startOnView?` = `true`, `once?` = `false`, `accessible?` = `true`
- `className?`, `segmentClassName?`

## Анимации

Контейнер variants `hidden/show/exit` с `delayChildren: delay`,
`staggerChildren: duration/n`; элемент — пресет (opacity, `blur(10px)`,
`y/x ±20`, `scale 0.5/1.5` пружиной 15/300). Запуск `whileInView` или
`animate="show"`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/text-animate.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/text-animate.mdx` — документация
- `templates/react-libriry/magicui/apps/www/registry/example/text-animate-demo.tsx` — пример

## Зависимости

`motion` (`motion.*`, `AnimatePresence`, `Variants`), `cn`.

## Совместимость и адаптация

`adaptable`. Сегментацию и пресеты оставить как таблицу значений;
для сегмента `i`: `p = interpolate(frame, [d + i·s, d + i·s + dur],
[0, 1], clamp)` → opacity, `blur(10·(1-p))`, `y = 20·(1-p)`; для
`scaleUp/Down` — `spring({frame: frame - start, fps, config:{damping:15,
stiffness:300}})`. `whileInView`/`AnimatePresence` убрать.

## Паттерны

`sequence-steps`, `key-point-emphasis`
