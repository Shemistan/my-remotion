# TextEffect — `motion-primitives/text-effect`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Строка текста, которая проявляется по словам, символам или строкам со
stagger: fade, blur, «подъём с размытием», scale или slide; есть обратная
анимация исчезновения (exit) в обратном порядке.

## Когда использовать

Заголовок сцены, ключевая фраза, цитата, тезис, который диктор произносит
прямо сейчас. `per='line'` — для многострочных подписей. Для смены одного
слова в фразе лучше `text-loop`, для «расшифровки» — `text-scramble`.

## Фразы из озвучки

- «главная мысль этого видео — …»
- «запомните одно правило»
- «и вот что получилось в итоге»
- «давайте сформулируем вывод»

## Визуальный стиль

Нейтральный: стиль задаётся `className`/`style`. Пресет `fade-in-blur`
(opacity + y 20 + blur 12px) даёт «премиальный» мягкий вход; `scale` —
игривее.

## Входные данные

`TextEffectProps`: `children: string`; `per?: 'word'|'char'|'line'`
(`'word'`); `as?` (`'p'`); `preset?: 'blur'|'fade-in-blur'|'scale'|'fade'|'slide'`
(`'fade'`); `variants?: {container?, item?}`; `delay?` (0, с);
`speedReveal?` (1), `speedSegment?` (1); `trigger?` (true);
`containerTransition?`, `segmentTransition?`; `segmentWrapperClassName?`;
`className?`, `style?`; `onAnimationStart?`, `onAnimationComplete?`.

Stagger по умолчанию: char 0.03 с, word 0.05 с, line 0.1 с (делится на
`speedReveal`); длительность сегмента 0.3 с / `speedSegment`.

## Анимации

`AnimatePresence` + варианты `hidden → visible → exit`, `staggerChildren`
и `delayChildren` у контейнера; текст режется `split(/(\s+)/)` или по `\n`.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/text-effect.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/text-effect/page.mdx` — документация и таблица props
- `templates/react-libriry/motion-primitives/app/docs/text-effect/text-effect-per-char.tsx` — пример

## Зависимости

`motion` (`motion/react`), `@/lib/utils` (`cn`), Tailwind-классы.

## Совместимость и адаптация

`adaptable`: таймеров и DOM-измерений нет, анимация — только вход/выход
через motion. Оставить разбиение текста и разметку, `motion.span` заменить
на `span` со стилем из кадра: для сегмента `i` —
`p = interpolate(frame, [start + i*stagger*fps, start + i*stagger*fps + 0.3*fps], [0,1], {clamp})`,
из `p` — `opacity`, `translateY(20*(1-p))`, `blur(12*(1-p)px)`. Exit —
то же в обратном порядке от конца сцены. `AnimatePresence`/`trigger`
убрать.

## Паттерны

`key-point-emphasis`, `abstract-concepts`, `sequence-steps`
