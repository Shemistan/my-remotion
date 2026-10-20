# TechText — `react-bits/tech-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom`, `async-data`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Вордмарк на canvas, буквы которого под «линзой» превращаются в пунктирные
векторные контуры; вокруг буквы — рамка выделения с маркерами, бегущими
точками-«спеками» и подписью размеров; направляющие шрифта (baseline,
x-height, cap height). Интро: набор (`type`), сборка из пикселей
(`assemble`) или прорисовка по метрикам (`metrics`).

## Когда использовать

Типографика, дизайн-инструменты, «разбираем шрифт», бренд-айдентика,
интерфейс редактора. Для простой прорисовки контура — `react-bits/stroke-text`.

## Фразы из озвучки

- «Каждая буква выверена до пикселя»
- «Посмотрим, как устроен наш шрифт»
- «Дизайн — это детали»

## Визуальный стиль

150px/600, трекинг -0.05, пунктир 4/2, линии 1.5px; моноширинные подписи
10px; «инженерно-дизайнерский» UI, акцент `currentColor`.

## Входные данные

`text='React Bits'`, `fontFamily=''`, `fontWeight=600`, `fontSize=150`,
`letterSpacing=-0.05`, `color='currentColor'`, `accentColor='currentColor'`,
`align='center'`, `reach=200`, `softness=0.7`, `dashLength=4`, `dashGap=2`,
`strokeWidth=1.5`, `lineStyle='dashed'`, `reveal='letter'` (`letter|area`),
`specks=15`, `selection=true`, `labels=true`, `draggable=true`, `bounce=0.4`,
`sweep=true`, `speed=1`, `clickKick=true`, `intro='none'`
(`none|type|assemble|metrics`), `introDuration=2`, `guides=false`, `className`, `style`.

## Анимации

rAF-цикл: прогресс интро — чистая функция `introClock` (клетки сборки с
детерминированным `noise()`, полосы заливки по метрикам); без курсора
`sweep` ведёт линзу по `cos/sin(clock)`, но с экспоненциальным догоном;
буквы можно таскать (пружины), клик — волна «пинков». Глифы — спрайты
offscreen-canvas; шрифт подгружается `document.fonts.load`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/TechText/TechText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/TechText/TechText.css` — контейнер
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/TechText/TechText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/TechTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/tech-text

## Зависимости

Нет внешних пакетов (Canvas 2D).

## Совместимость и адаптация

`complex`: императивный canvas-цикл с пружинами и сглаживанием. Пригодны
интро (`type/assemble/metrics`) и авто-`sweep`: вызывать `tick` из
`useEffect` по кадру с `dt = 1/fps` последовательно (или вычислять
`introClock = frame/fps`, `clock = frame/fps*speed`, линзу ставить сразу в
цель), отключить drag/kick/pointer. Шрифт и спрайты готовить под
`delayRender`. Эффект линзы от курсора в видео не воспроизводится.

## Паттерны

`key-point-emphasis`, `system-structure`
