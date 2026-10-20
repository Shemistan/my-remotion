# TransitionPanel — `motion-primitives/transition-panel`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `transitions-scene` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Панель, в которой содержимое сменяется по `activeIndex`: уходящий слайд
проигрывает `exit`, новый — `enter → center` (сдвиг, blur, fade — как
зададите в variants).

## Когда использовать

Смена карточек/слайдов внутри одного блока: шаги инструкции, «вкладки»
с фичами, смена экранов в макете телефона. Для смены всей сцены — обычный
`TransitionSeries` Remotion.

## Фразы из озвучки

- «переходим к следующему шагу»
- «а теперь вторая возможность»
- «листаем дальше»

## Визуальный стиль

Целиком задаётся снаружи через `variants` — значений по умолчанию в
компоненте нет (без variants смена мгновенная). `AnimatePresence
mode='popLayout'`.

## Входные данные

`TransitionPanelProps`: `children: React.ReactNode[]`; `activeIndex: number`;
`variants?: {enter, center, exit}`; `transition?`; `className?`; плюс
`MotionProps` (например `custom` для направления).

## Анимации

`AnimatePresence initial={false} mode='popLayout'`, `motion.div
key={activeIndex}` с `initial='enter' animate='center' exit='exit'`.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/transition-panel.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/transition-panel/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/transition-panel/transition-panel-card.tsx` — пример

## Зависимости

`motion` (`AnimatePresence`, `motion.div`), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `activeIndex` считать из кадра по расписанию шагов;
`AnimatePresence` заменить ручным рендером двух панелей на время
перехода: `p = interpolate(frame - tSwitch, [0, d], [0,1], {clamp})`,
уходящая — стиль `exit` × p, входящая — `enter → center` × p (x, opacity,
`filter: blur`). Либо `TransitionSeries` из `@remotion/transitions`.

## Паттерны

`sequence-steps`, `transformation`
