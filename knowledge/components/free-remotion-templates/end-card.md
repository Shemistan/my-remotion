# End Card / Outro — `free-remotion-templates/end-card`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `layout-templates` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Финальная карточка ролика: акцентная линия, крупный заголовок, подзаголовок
разрядкой, две расширяющиеся окружности на фоне и CTA-«таблетка» с
нарисованным шевроном и бегущим бликом.

## Когда использовать

Концовка ролика: «спасибо за просмотр», призыв перейти на сайт, подписаться.
Для промежуточных разделов лучше chapter-title.

## Фразы из озвучки

- «спасибо, что досмотрели до конца»
- «подробности — на нашем сайте»
- «подписывайтесь, чтобы не пропустить следующий выпуск»

## Визуальный стиль

Тёмно-синий фон `#0b1f3a`, золотой акцент `#d4af37`, белый жирный
заголовок; системный sans-serif. В Root: 1920×1080, 150 кадров. Размеры
шрифтов от высоты кадра, есть портретная раскладка (`height > width`).

## Входные данные

`EndCardProps`: `title` («Thanks for watching»), `subtitle` («LEARN MORE AT
OUR SITE»), `ctaText` («Visit our website»), `background` (`#0b1f3a`),
`titleColor` (`#ffffff`), `accentColor` (`#d4af37`).

## Анимации

Кольца: scale 0.3→1.6 за 90 кадров (`Easing.out(cubic)`), opacity 0→0.25→0.1.
Заголовок: `spring` scale с кадра 8 + fade 8–24. Подзаголовок: fade + y 20→0
на 24–40. CTA с кадра 60: подъём и scale 0.94→1; блик — цикл 2.4 с по
`frame % period`; шеврон качается `sin`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/end-card/EndCard.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`, адаптации не нужны. Тайминги (кадр 60 для CTA) зашиты в коде —
при укорачивании композиции ниже ~80 кадров CTA не успеет появиться.

## Паттерны

`key-point-emphasis`
