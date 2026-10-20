# WordReveal — `motion-primitives-website/word-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Фраза, слова которой по очереди «откидываются» из плоскости экрана:
`rotateX −90° → 0`, подъём на 30 px и проявление.

## Когда использовать

Заголовок слайда, слоган, вывод из 3–10 слов; более «объёмная» подача,
чем простой fade. Для одного короткого слова — `character-reveal`.

## Фразы из озвучки

- «три простых шага к результату»
- «скорость, качество и цена»
- «это меняет правила игры»

## Визуальный стиль

Слова `inline-block mr-[0.25em]`, `perspective: 1000` у каждого;
кривая `[0.215, 0.61, 0.355, 1]`, 0.6 с.

## Входные данные

`WordRevealProps`: `text: string`; `delay?` (0); `staggerDelay?` (0.1);
`once?` (true); `className?`.

## Анимации

`useInView` → варианты `hidden {opacity 0, y 30, rotateX -90}` →
`visible {opacity 1, y 0, rotateX 0}` с задержкой `delay + i*staggerDelay`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/text-reveal.tsx` — компонент

## Зависимости

`framer-motion`, `@/lib/utils`; файл импортирует `gsap`/`ScrollTrigger`.

## Совместимость и адаптация

`adaptable`: убрать `useInView`/`useAnimation`; для слова `i`
`p = interpolate(frame, [s_i, s_i + 0.6*fps], [0,1], {clamp, easing: Easing.bezier(0.215, 0.61, 0.355, 1)})`
→ `opacity: p`, `transform: perspective(1000px) translateY(${30*(1-p)}px) rotateX(${-90*(1-p)}deg)`.

## Паттерны

`key-point-emphasis`, `sequence-steps`
