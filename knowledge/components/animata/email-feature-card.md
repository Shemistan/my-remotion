# EmailFeatureCard — `animata/email-feature-card`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Мокап формы письма «Send an Email»: поля From / To / Subject / Body уже
заполнены статичным текстом (you@example.com, recipient@example.com, «The
Pokemon I caught this week»…); по hover верхняя карточка слегка
уменьшается (`scale-95`).

## Когда использовать

Иллюстрация e-mail-рассылки, автоматического письма, «отправляем
уведомление». В основном как статичная композиция. Hover-анимацию
воспроизвести по кадру.

## Фразы из озвучки

- «клиенту автоматически уходит письмо»
- «настроим e-mail рассылку»
- «письмо готово к отправке»

## Визуальный стиль

Светлый UI-мокап `bg-gray-50`/`bg-white`, `rounded-lg`, поля `bg-gray-100`.

## Входные данные

Props нет; тексты зашиты (компонент `EmailCard`). Нижняя часть файла
(после строки 40) в этом проходе подробно не разбиралась.

## Анимации

`transition-transform duration-200` + `group-hover/email:scale-95` у верхней
карточки; `transition-shadow` у контейнера.

## Исходники и документация

- `templates/react-libriry/animata/animata/card/email-feature-card.tsx` — компонент
- `templates/react-libriry/animata/content/docs/card/email-feature-card.mdx` — документация
- `templates/react-libriry/animata/animata/card/email-feature-card.stories.tsx` — пример

## Зависимости

React, Tailwind.

## Совместимость и адаптация

Вынести поля в props; заполнять их по кадру (`animata/typing-text` после
адаптации); `scale` из кадра в момент «отправки».

## Паттерны

`sequence-steps`, `cause-effect`
