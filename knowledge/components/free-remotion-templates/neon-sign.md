# Neon Sign Flicker — `free-remotion-templates/neon-sign`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | `svg`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Неоновая вывеска в рамке с винтами: надпись «зажигается» с мерцанием,
затем горит ровно с редкими морганиями; под ней проявляется подпись.

## Когда использовать

«Мы открылись», запуск, вечерняя/барная/ретро-атмосфера, акцент на одном
коротком слове. Для цифрового сбоя вместо мерцания — `glitch-text`.

## Фразы из озвучки

- «мы открыты для новых клиентов»
- «свет зажёгся — пора начинать»
- «одно слово, которое всё объясняет»

## Визуальный стиль

Почти чёрный фиолетовый фон `#080010`, розово-фиолетовый неон
`#f0abfc`/`#c026d3` с многослойным размытым свечением, серая рамка.
Системный стек `-apple-system, "Segoe UI", Roboto, sans-serif`. 1080×1080,
100 кадров (3.33 с), 30 fps.

## Входные данные

`NeonSignProps`: `backgroundColor` (`#080010`), `neonColor` (`#f0abfc`),
`glowColor` (`#c026d3`), `flickerColor` (`#e879f9`, в рендере не
используется), `frameColor` (`#3f3f46`), `textColor` (`#fae8ff`, не
используется), `subColor` (`#a21caf`), `signText` («OPEN»), `subText`
(«Now serving»).

## Анимации

Мерцание кадры 0–25: `Math.sin(frame*3.7)` и `sin(frame*7.1)` —
детерминированно; моргания на кадрах 38, 39, 55; свечение — три слоя
SVG-`<text>` с `filter: blur`; рамка 0→10, подпись 30→44 (`interpolate`).

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/neon-sign/NeonSign.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`interpolate`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`. У фонового свечения стоит `transition: "opacity 0.02s"` — в
покадровом рендере бесполезна (opacity задаётся через цвет), можно
удалить. Длинный `signText` не помещается в рамку (размер фиксирован от
min(width,height)).

## Паттерны

`key-point-emphasis`
