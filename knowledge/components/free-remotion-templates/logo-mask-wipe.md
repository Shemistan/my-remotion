# Logo Mask Wipe — `free-remotion-templates/logo-mask-wipe`

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

Круглый бейдж с монограммой открывается диагональной маской, по краю
которой бежит светлая полоса-блик; затем снизу поднимается название бренда
с подчёркиванием.

## Когда использовать

Брендовое интро/аутро, заставка компании, «лого-локап» с буквой и
названием. Если нужен эффект прорисовки кольца — `logo-stroke-draw`
(та же композиция, другой вход).

## Фразы из озвучки

- «компания ACME представляет»
- «вот кто стоит за этим проектом»
- «наш бренд — это доверие»

## Визуальный стиль

Тёмный фон `#0a0800`, золотой акцент `#eab308`, светлый текст `#fefce8`;
радиальное свечение за бейджем, разрядка 0.22em у названия. Системный
стек `-apple-system, "Segoe UI", Roboto, sans-serif`. 1920×1080, 100
кадров (3.33 с), 30 fps.

## Входные данные

`LogoMaskWipeProps`: `backgroundColor` (`#0a0800`), `accentColor`
(`#eab308`), `textColor` (`#fefce8`), `monogram` («A»), `brandText`
(«ACME INC.»).

## Анимации

`interpolate` 0→46 кадр — смещение `rect` в SVG `clipPath`, повёрнутого
на −28°; блик-полоса едет по краю маски; `spring` с 30 кадра — масштаб
1.06→1; название и подчёркивание — 40→58 кадр (opacity, translateY,
ширина).

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/logo-mask-wipe/LogoMaskWipe.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`interpolate`, `spring`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`. `clipPath id="lmw-wipe"` фиксирован — при нескольких экземплярах
на одном кадре сделать id уникальным. Монограмма — один символ текста; для
настоящего логотипа заменить `<text>` на SVG.

## Паттерны

`key-point-emphasis`
