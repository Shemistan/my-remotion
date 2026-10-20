# Marquee 3D (пример) — `magicui/marquee-3d`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | example |
| Категория | `3d-camera` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `user-events`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Наклонённая в перспективе «стена» из четырёх вертикальных колонок
карточек-отзывов, бегущих попеременно вверх и вниз; края кадра гаснут
градиентами в фон.

## Когда использовать

Масштаб социального доказательства: «тысячи отзывов», «сообщество»,
обилие кейсов — эффектнее плоской ленты `marquee`.

## Фразы из озвучки

- «тысячи довольных пользователей»
- «сообщество, которое растёт каждый день»
- «отзывы говорят сами за себя»

## Визуальный стиль

`perspective: 300px`, контейнер `translateX(-100px) translateZ(-100px)
rotateX(20deg) rotateY(-10deg) rotateZ(20deg)`; карточки-отзывы с
аватаром, именем, @username; `--duration: 20s`.

## Входные данные

Сцена без props: массив отзывов внутри файла делится на 4 ряда
(`firstRow`…`fourthRow`), карточка `ReviewCard {img, name, username,
body}`. Для своего ролика — подставить свои данные.

## Анимации

4 × `Marquee vertical` (два с `reverse`), `pauseOnHover`; движение —
CSS `@keyframes marquee-vertical`. 3D — статичный transform обёртки.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/example/marquee-3d.tsx` — сцена
- `templates/react-libriry/magicui/apps/www/registry/magicui/marquee.tsx` — используемый компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/marquee.mdx` — документация

## Зависимости

`magicui/marquee`, Tailwind v4, `cn`.

## Совместимость и адаптация

`adaptable`: как у `magicui/marquee` — отрицательный `animationDelay`
от кадра + `paused` на каждой копии; `pauseOnHover` убрать. Можно
дополнительно анимировать камеру (rotateX/rotateZ обёртки) по кадру.
Аватары в примере — внешние URL; заменить на `staticFile`.

## Паттерны

`quantities`, `spatial`, `relationships`
