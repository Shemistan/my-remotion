# ConfirmationMessage — `animata/confirmation-message`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Сцена успеха на бирюзово-зелёном градиенте: круглая тёмно-зелёная
галочка ✓, из которой вправо вырастает капсула с текстом «Process
Successful»; затем снизу въезжает карточка-сообщение с аватаром-буквой,
именем отправителя и текстом.

## Когда использовать

«Готово!», «оплата прошла», «бот выполнил задачу», финальный шаг
процесса. Хорошо ложится на конец последовательности шагов.

## Фразы из озвучки

- «и всё — процесс успешно завершён»
- «бот выполнил задачу за вас»
- «оплата прошла»

## Визуальный стиль

Градиент teal-100 → green-300, green-800 капсула, белая карточка с
backdrop-blur; спокойная последовательная анимация ≈3 с.

## Входные данные

`successMessage = "Process Successful"`, `labelName = "Animata"`,
`labelMessage: string` (обязателен; обрезается до 200 символов),
`backgroundClassName?`, `containerClassName?`.

## Анимации

`motion.div` по монтированию: капсула `width 0 → 12rem` (delay 0.5, 0.8
с), текст `x -1000 → 0` (delay 0.3, 1 с), карточка `y 100 → 0, opacity`
(delay 1.2, 0.5 с), текст сообщения `opacity` (delay 2, 0.9 с).

## Исходники и документация

- `templates/react-libriry/animata/animata/feature-cards/confirmation-message.tsx` — компонент
- `templates/react-libriry/animata/content/docs/feature-cards/confirmation-message.mdx` — документация
- `templates/react-libriry/animata/animata/feature-cards/confirmation-message.stories.tsx` — пример

## Зависимости

`motion`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable` — образцовый случай «анимация только на входе»: заменить
`motion.div` на `div` и посчитать те же величины `interpolate(frame,
[delay*fps, (delay+dur)*fps], [from, to], clamp)` (тайминги из кода).
Фон `absolute -z-10` требует родителя с позиционированием.

## Паттерны

`cause-effect`, `sequence-steps`, `key-point-emphasis`
