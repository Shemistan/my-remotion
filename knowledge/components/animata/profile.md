# Profile — `animata/profile`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md); аватар по умолчанию — изображение с ign.com (сторонний персонаж) |

## Что визуализирует

Карточка профиля 208×208: круглый аватар, имя и подпись, внизу полоса
соцсетей (X, LinkedIn, Dribbble, Facebook).

## Когда использовать

«Знакомьтесь — автор/спикер/эксперт», контакт в конце ролика.

## Фразы из озвучки

- «меня зовут…, и я расскажу…»
- «подписывайтесь в соцсетях»
- «познакомьтесь с нашим экспертом»

## Визуальный стиль

cyan-200 (dark: zinc-800), rounded-3xl, иконки lucide; лёгкий,
дружелюбный.

## Входные данные

Без props: имя «Avatar Aang», подпись, URL аватара и ссылки зашиты.

## Анимации

Hover: `scale-125` аватара, `scale-110` иконок, тень карточки
(`transition`/`duration-300`).

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/profile.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/profile.mdx` — документация
- `templates/react-libriry/animata/animata/widget/profile.stories.tsx` — пример

## Зависимости

`lucide-react`.

## Совместимость и адаптация

`adaptable`: вынести имя/подпись/аватар/список соцсетей в props;
**заменить аватар** (чужой персонаж, внешний URL) на свой через
`staticFile`; ссылки `<a>` — на `span`. Вход — аватар scale-in, иконки
stagger.

## Паттерны

`key-point-emphasis`
