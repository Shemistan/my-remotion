# TypewriterEffect — `motion-primitives-website/typewriter-effect`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Печатная машинка: слово набирается по букве, держится 2 с, стирается
(вдвое быстрее) и сменяется следующим; справа мигающий курсор-полоска.

## Когда использовать

«Мы делаем [сайты / приложения / ИИ-агентов]», имитация ввода в поиск или
терминал, перебор вариантов. Для однократной печати фразы — тот же
приём без стирания.

## Фразы из озвучки

- «просто введите запрос»
- «мы создаём сайты, приложения и сервисы»
- «напишите что угодно — система поймёт»

## Визуальный стиль

`flex items-center`; курсор `w-[4px] h-[1em] bg-current animate-pulse`;
у каждого слова свой `className` (цвет/градиент).

## Входные данные

`TypewriterEffectProps`: `words: {text: string; className?: string}[]`;
`speed?` (100, мс на символ; стирание — `speed/2`); `className?`;
`cursorClassName?`. Пауза после набора — 2000 мс (зашито).

## Анимации

Цепочка `setTimeout` меняет `currentText` по одному символу; Tailwind
`animate-pulse` (CSS keyframes) у курсора.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/text-generate.tsx` — компонент

## Зависимости

`react`, `@/lib/utils` (`cn`), Tailwind (`animate-pulse`).

## Совместимость и адаптация

`adaptable`: состояние — чистая функция от времени. Для слова длины `L`:
цикл `T = L*speed + 2000 + L*speed/2` мс; `t = (frame/fps*1000 - offset) mod T`;
`len = t < L*speed ? floor(t/speed) : t < L*speed+2000 ? L : L - floor((t - L*speed - 2000)/(speed/2))`;
слово выбирается по накопленным длительностям. Курсор: `opacity` от
`frame` (`0.5 + 0.5*cos(2π·frame/fps)`) вместо `animate-pulse`.

## Паттерны

`sequence-steps`, `abstract-concepts`
