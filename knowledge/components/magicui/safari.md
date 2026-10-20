# Safari — `magicui/safari`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Окно браузера Safari (macOS): три «светофора», адресная строка с
замком и URL, кнопки навигации/поделиться/вкладок; в окне — скриншот
или видео сайта.

## Когда использовать

Показ веб-продукта, лендинга, дашборда, «заходим на сайт»; демо
веб-интерфейса. Для мобильного — `iphone`/`android`.

## Фразы из озвучки

- «откройте сайт в браузере»
- «вот так выглядит личный кабинет»
- «всё работает прямо в браузере, без установки»

## Визуальный стиль

Плоский светлый хром `#E5E5E5` / `#404040`, иконки `#A3A3A3`,
`Arial 12` для URL; пропорции 1203:753, контент 1200×700.

## Входные данные

- `url?: string` — текст в адресной строке
- `imageSrc?: string`, `videoSrc?: string` (видео приоритетнее)
- `mode?: "default"|"simple"` = `"default"` (`simple` — без иконок навигации)
- `className?`, `style?`, атрибуты `div`.

## Анимации

Нет. Видео — `<video autoPlay loop muted>`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/safari.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/safari.mdx` — документация

## Зависимости

React. Пакетов нет.

## Совместимость и адаптация

`adaptable`. `<img>`/`<video>` заменить на `<Img>`/`<OffthreadVideo>`
со `staticFile`; в экран можно вставить живую Remotion-сцену
(скролл страницы — `translateY` скриншота по кадру, «печать» URL —
срез строки `url` по кадру). Шрифт URL — Arial (в Linux-рендере
может подмениться). `mask id="safariPunch"` глобальный.

## Паттерны

`spatial`, `sequence-steps`
