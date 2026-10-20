# FlipWords — `motion-primitives-website/flip-words`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Слово в строке, которое по таймеру сменяется следующим: новое въезжает
снизу (y 100% → 0), старое уходит вверх (→ −100%) с затуханием.

## Когда использовать

Перебор вариантов в одной позиции заголовка («быстрее / проще / дешевле»).
Аналог `motion-primitives/text-loop`.

## Фразы из озвучки

- «это быстрее, проще и дешевле»
- «для стартапов, агентств и корпораций»
- «каждый день — новая задача»

## Визуальный стиль

`relative inline-block overflow-hidden`, ширина задаётся невидимым
первым словом; `easeInOut`, 0.5 с.

## Входные данные

`FlipWordsProps`: `words: string[]`; `duration?` (3000, мс на слово);
`className?`.

## Анимации

`setInterval(duration)` меняет `currentIndex`; все слова абсолютно
наложены, у каждого `animate` по признаку «текущее/нет».

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/text-generate.tsx` — компонент

## Зависимости

`framer-motion`, `react`, `@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: `period = duration/1000*fps`, `index = floor(frame/period) % n`,
`local = frame % period`, `p = interpolate(local, [0, 0.5*fps], [0,1], {easing: Easing.inOut(Easing.ease), clamp})`;
текущее слово `y = 100*(1-p)%`, `opacity = p`; предыдущее
`y = -100*p%`, `opacity = 1-p`; остальные скрыты. Ширину лучше брать по
самому длинному слову, а не по первому.

## Паттерны

`abstract-concepts`, `comparison`
