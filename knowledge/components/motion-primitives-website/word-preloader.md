# WordPreloader — `motion-primitives-website/word-preloader`

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

Чёрный экран, в центре быстро (каждые 0.4 с) сменяются крупные слова
(снизу вверх), под ними — точки-индикатор текущего слова; на выходе
экран уезжает вверх.

## Когда использовать

Интро-перечисление ценностей/глаголов («Думаем. Строим. Запускаем.»),
быстрый ритмичный монтаж слов перед основной сценой.

## Фразы из озвучки

- «думаем, проектируем, создаём, запускаем»
- «всего за несколько шагов»
- «от идеи до запуска»

## Визуальный стиль

`text-5xl md:text-7xl font-bold text-white` на `bg-black`; точки 8 px
`#fff`/`#333`, активная `scale 1.2`; выход `y → -100%`, 0.8 с.

## Входные данные

`WordPreloaderProps`: `words?` (`['Loading', 'Building', 'Creating',
'Launching']`); `className?`. Требует `PreloaderProvider` (берёт
`progress`, но не отображает).

## Анимации

`setInterval(400 мс)` → индекс; `AnimatePresence mode='wait'`: enter
`y 50 → 0`, exit `y → -50` (0.3 с); точки `backgroundColor`/`scale`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/transitions/preloader.tsx` — компонент

## Зависимости

`framer-motion`, `react` (context), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `index = floor(frame/(0.4*fps)) % n` (или своё расписание
под озвучку), смена по схеме `wait`: в начале периода exit старого,
затем enter нового (`y`, `opacity` по `interpolate`); точки — цвет по
индексу; провайдер не нужен; выход — `translateY(-100%*p)` по кадру.

## Паттерны

`sequence-steps`, `key-point-emphasis`
