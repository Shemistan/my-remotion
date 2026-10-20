# GradientText — `motion-primitives-website/gradient-text`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Текст, залитый градиентом (по умолчанию фиолетовый → розовый → красный);
с `animate` градиент медленно переливается туда-обратно.

## Когда использовать

Акцентное слово в заголовке («в **10 раз** быстрее»), название бренда,
цифра-вывод. Статичный режим работает в Remotion без изменений.

## Фразы из озвучки

- «в десять раз быстрее»
- «это наш главный продукт»
- «будущее уже наступило»

## Визуальный стиль

`bg-gradient-to-r bg-clip-text text-transparent` + Tailwind-классы
градиента; анимация `gradient 8s linear infinite`
(`background-position left ↔ right`, `background-size 200%`).

## Входные данные

`GradientTextProps`: `children: ReactNode`; `gradient?`
(`'from-purple-500 via-pink-500 to-red-500'`); `animate?` (false);
`className?`.

## Анимации

Только CSS `animate-gradient` (keyframes `gradient` в
`tailwind.config.ts`); `motion.span` без motion-props.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/gradient-text.tsx` — компонент
- `templates/react-libriry/motion-primitives-website/tailwind.config.ts` — keyframes `gradient`
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Gradient Text»

## Зависимости

`tailwindcss` 3 (классы и keyframes из конфига), `framer-motion`
(только обёртка), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: статичный вариант — как есть. Для `animate`: вместо
`animate-gradient` — `backgroundSize: '200% 200%'`,
`backgroundPosition: \`${50 - 50*Math.cos(2*Math.PI*frame/(8*fps))}% 50%\``
(или keyframes с `animationDelay: -frame/fps s` и
`animationPlayState: paused`). Нужен Tailwind в проекте или перенос
классов в inline-style.

## Паттерны

`key-point-emphasis`, `quantities`
