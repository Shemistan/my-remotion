# TypingText — `motion-primitives-website/typing-text`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Печатание фраз из массива по буквам, пауза, стирание и переход к
следующей; мигающий курсор 3 px цвета `bg-primary`.

## Когда использовать

Ввод запроса в поле, чат-бот «печатает», перечисление вариантов. Отличие
от `typewriter-effect`: отдельные скорости набора/стирания и пауза
настраиваются, курсор отключается.

## Фразы из озвучки

- «спросите у ассистента что угодно»
- «вводим команду в терминал»
- «найдите нужное за секунды»

## Визуальный стиль

`inline-flex`; курсор `w-[3px] h-[1em] bg-primary` (CSS-переменная темы
сайта — задать свой цвет).

## Входные данные

`TypingTextProps`: `texts: string[]`; `speed?` (80, мс/символ);
`deleteSpeed?` (40); `pauseTime?` (2000); `cursor?` (true); `className?`.

## Анимации

Цепочка `setTimeout` по символу; курсор — motion `opacity [1, 0]`,
0.5 с, `repeatType: 'reverse'`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/morphing-text.tsx` — компонент

## Зависимости

`framer-motion`, `react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: для фразы длины `L` цикл `T = L*speed + pauseTime + L*deleteSpeed`
мс; `t = (frame/fps*1000 - offset) mod T`; длина видимой части —
`floor(t/speed)` при наборе, `L` в паузе, `L - floor((t - L*speed - pauseTime)/deleteSpeed)`
при стирании; фраза — по накопленным циклам. Курсор:
`opacity = floor(frame/(0.5*fps)) % 2 ? 0 : 1`.

## Паттерны

`sequence-steps`, `abstract-concepts`
