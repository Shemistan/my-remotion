# ImageCarousel — `animata/image-carousel`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition`, `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Белая рамка 600×500 с тремя видимыми карточками 200×250 веером:
центральная увеличена (scale 1.1) и резкая, левая и правая повёрнуты на
∓20° и размыты; стрелки влево/вправо по краям листают.

## Когда использовать

Перелистывание вариантов/товаров/скриншотов, «выбор из трёх», галерея с
фокусом на текущем элементе.

## Фразы из озвучки

- «листаем варианты»
- «в центре — наш выбор»
- «посмотрим следующий»

## Визуальный стиль

Карточки rounded-xl с фоновыми фото (`backgroundImage`), blur 4px у
боковых, стеклянные кнопки-стрелки; переходы 0.5 с ease.

## Входные данные

`items: {id: number, title: string, image: string}[]` (обязателен, без
дефолта). Стартовый индекс — 1.

## Анимации

Клик по стрелкам меняет `currentIndex`; transform/filter карточек —
CSS `transition 0.5s ease`; `animate-fadeIn` (0.5 с) при монтировании
карточки.

## Исходники и документация

- `templates/react-libriry/animata/animata/carousel/image-carousel.tsx` — компонент
- `templates/react-libriry/animata/content/docs/carousel/image-carousel.mdx` — документация
- `templates/react-libriry/animata/animata/carousel/image-carousel.stories.tsx` — пример

## Зависимости

`lucide-react`; `--animate-fadeIn` из `styles/globals.css`.

## Совместимость и адаптация

`adaptable`: индекс из кадра; позиции трёх слотов известны из кода —
интерполировать transform/blur между слотами по `frame % step` вместо
CSS-transition (элементы меняются ключами, поэтому рендерить все
карточки и вычислять слот каждой). Кнопки можно оставить декорацией.

## Паттерны

`comparison`, `sequence-steps`
