# NoiseTransition — `motion-primitives-website/noise-transition`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `transitions-scene` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Переход-«растворение»: экран засыпается чёрными пикселями шума до
полного покрытия, затем шум рассеивается поверх цветного фона. В
реестре назван «Perlin noise», но в коде — независимый случайный шум
на каждый пиксель.

## Когда использовать

Резкий «цифровой» переход между сценами, сбой сигнала, смена главы в
техно-ролике.

## Фразы из озвучки

- «перемотаем вперёд»
- «сигнал пропал… и вернулся»
- «переходим к следующей части»

## Визуальный стиль

Чёрные пиксели на прозрачном (фаза covering), затем на фоне `color`
(`hsl(var(--primary))`); полный цикл `duration` 1.2 с, easeOut-кубика.

## Входные данные

`NoiseTransitionProps`: `isActive: boolean`; `duration?` (1.2, с);
`color?`; `onComplete?`; `children?`.

## Анимации

Фазы `idle → covering → revealing → idle` в `useState`; rAF от
`performance.now()`; на каждом кадре `Math.random()` по каждому пикселю
`window.innerWidth × innerHeight` с порогом `1 - (1-p)^3`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/transitions/noise-transition.tsx` — компонент
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Noise Transition»

## Зависимости

`framer-motion` (`AnimatePresence`), `react`.

## Совместимость и адаптация

`complex`: машина состояний на rAF и попиксельный `Math.random` по
полному экрану. Переработка: порог `p` считать из кадра
(`[0, d/2]` — covering, `[d/2, d]` — revealing); шум сделать
стабильным во времени — заранее сгенерировать одну карту шума с
семенем (`random(seed)`) в низком разрешении и сравнивать с порогом
(эффект «растворения», а не мерцания), рисовать в `useEffect([frame])`;
размеры — `useVideoConfig()`. Альтернатива — `@remotion/transitions`
с кастомным presentation.

## Паттерны

`transformation`, `cause-effect`
