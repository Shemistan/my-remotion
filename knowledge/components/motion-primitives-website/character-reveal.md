# CharacterReveal — `motion-primitives-website/character-reveal`

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

Строка, буквы которой по очереди выпрыгивают снизу (y 50 → 0, opacity
0 → 1) с easeOutCubic.

## Когда использовать

Короткий крупный заголовок, название раздела, имя продукта. Для длинных
фраз — `word-reveal` (по словам меньше мельтешения).

## Фразы из озвучки

- «знакомьтесь — наш новый продукт»
- «глава вторая»
- «итак, результат»

## Визуальный стиль

`inline-block` спаны по символам, пробел → ` `; кривая
`[0.215, 0.61, 0.355, 1]`, 0.5 с на символ.

## Входные данные

`CharacterRevealProps`: `text: string`; `delay?` (0, с);
`staggerDelay?` (0.02, с); `once?` (true); `className?`.

## Анимации

`useInView(ref, {once, amount: 0.5})` → `controls.start('visible')`;
у символа `i` задержка `delay + i*staggerDelay`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/text-reveal.tsx` — компонент (+ `WordReveal`, `LineReveal`, `GradientReveal`)

## Зависимости

`framer-motion` (`useInView`, `useAnimation`), `@/lib/utils`; файл также
импортирует `gsap` + `ScrollTrigger` (для соседних компонентов).

## Совместимость и адаптация

`adaptable`: триггер `useInView` удалить (в видео появление задаётся
кадром); для символа `i`
`p = interpolate(frame, [s_i, s_i + 0.5*fps], [0,1], {clamp, easing: Easing.bezier(0.215, 0.61, 0.355, 1)})`,
`s_i = (delay + i*staggerDelay)*fps`; стиль `opacity: p`,
`translateY(${50*(1-p)}px)`. При копировании убрать импорт gsap.

## Паттерны

`key-point-emphasis`, `sequence-steps`
