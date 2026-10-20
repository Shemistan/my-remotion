# TransactionList — `animata/transaction-list`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `user-events`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Белая карточка 300px «Transactions» в стиле банковского приложения:
строки с чёрной круглой иконкой, названием, типом и суммой; кнопка «All
Transactions →». По клику строка плавно морфится (shared layout) в
детальный вид: сумма, id, дата/время, «Paid Via …», маска карты и логотип
Visa/MasterCard.

## Когда использовать

Mockup финтех-приложения: «последние операции», «чек по покупке». Для
автопрокрутки списка — `animata/transition-list`.

## Фразы из озвучки

- «все траты видны в одном месте»
- «нажимаем на операцию — и видим детали»
- «оплачено картой Visa»

## Визуальный стиль

Минималистичный iOS-like: белый, rounded-3xl, серые подписи, пружина
stiffness 350 / damping 30.

## Входные данные

`transactions: Transaction[]` (обязателен, без дефолта): `{id, name, type,
amount, date, time, icon: ReactNode, paymentMethod, cardLastFour,
cardType?: "visa" | иначе MasterCard}`.

## Анимации

`motion/react`: `layout` + `layoutId` на карточке, иконке, имени, типе,
сумме; `AnimatePresence mode="popLayout"` для смены список/детали;
появление деталей (`opacity/y`, delay 0.1–0.15 с); hover/tap scale.

## Исходники и документация

- `templates/react-libriry/animata/animata/list/transaction-list.tsx` — компонент
- `templates/react-libriry/animata/content/docs/list/transaction-list.mdx` — документация
- `templates/react-libriry/animata/animata/list/transaction-list.stories.tsx` — пример

## Зависимости

`motion`, `lucide-react`.

## Совместимость и адаптация

`adaptable` для списка (статичный mockup + stagger строк по кадру).
Морф в детали через `layoutId` в Remotion не воспроизводится — сделать
два состояния и cross-fade/scale по кадру (`selectedId` из кадра) или
вручную интерполировать позиции элементов.

## Паттерны

`sequence-steps`, `quantities`
