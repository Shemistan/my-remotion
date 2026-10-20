# ChatNotification — `motion-primitives-website/chat-notification`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Цветной баннер-уведомление (info / success / error / warning) с иконкой
в кружке и текстом; выезжает сверху, внизу тает полоска таймера
автозакрытия.

## Когда использовать

«Оплата прошла», «ошибка сборки», «новое сообщение», системные статусы
в демо интерфейса; акцент на событии.

## Фразы из озвучки

- «и вот приходит уведомление об оплате»
- «система сразу сообщает об ошибке»
- «готово — задача выполнена»

## Визуальный стиль

`rounded-lg border text-sm`, полупрозрачный фон цвета типа
(`blue/emerald/red/amber-500/10`), иконки `i ✓ ✗ !`; spring 300/25.

## Входные данные

`ChatNotificationProps`: `message: string`; `type?: 'info'|'success'|
'error'|'warning'` (`'info'`); `visible?` (true); `autoDismiss?` (5000,
мс); `onDismiss?`; `className?`.

## Анимации

Вход `opacity 0, y -20, height 0 → auto`; полоска `width 100% → 0%` за
`autoDismiss`, linear; `setTimeout(onDismiss, autoDismiss)`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/chat/animated-chat.tsx` — компонент

## Зависимости

`framer-motion` (`AnimatePresence`), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: появление — `p = spring({frame: frame - s, fps, config: {stiffness: 300, damping: 25}})`
(`opacity p`, `translateY(-20(1-p))`, без анимации высоты); полоска
`width: ${100*(1 - (frame - s)/(autoDismiss/1000*fps))}%`; `setTimeout`
удалить, исчезновение — концом `<Sequence>`. Полоска `absolute` — у
родителя нужен `relative` (в компоненте его нет).

## Паттерны

`cause-effect`, `key-point-emphasis`
