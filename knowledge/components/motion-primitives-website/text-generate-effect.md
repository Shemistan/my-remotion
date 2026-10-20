# TextGenerateEffect — `motion-primitives-website/text-generate-effect`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Абзац, слова которого по очереди проступают из размытия (blur 10px → 0,
opacity 0 → 1) — эффект «текст генерируется».

## Когда использовать

Ответ ИИ, цитата, тезис, который «рождается» на экране; длинная фраза
под озвучку. Для печати по символам — `typewriter-effect`.

## Фразы из озвучки

- «нейросеть формулирует ответ»
- «и вот что она написала»
- «прочитаем это ещё раз внимательно»

## Визуальный стиль

`font-bold`, остальное — `className`; мягкий, «AI-шный».

## Входные данные

`TextGenerateEffectProps`: `words: string`; `filter?` (true — включает
blur); `duration?` (0.5, с); `staggerDelay?` (0.02, с); `className?`.

## Анимации

`useAnimate` на mount: все `span` → `opacity: 1, filter: blur(0px)` с
`delay: stagger(staggerDelay)`. Текст режется по пробелу.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/text-generate.tsx` — компонент (+ `TypewriterEffect`, `FlipWords`)
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Text Generate» (props в реестре не совпадают с кодом)

## Зависимости

`framer-motion` (`useAnimate`, `stagger`), `@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: императивный `animate` на mount заменить стилем из кадра:
`p_i = interpolate(frame, [start + i*staggerDelay*fps, start + (i*staggerDelay + duration)*fps], [0,1], {clamp})`,
`opacity: p_i`, `filter: blur(${10*(1-p_i)}px)`; класс `opacity-0` убрать.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
