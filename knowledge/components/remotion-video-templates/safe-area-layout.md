# Safe area и раскладка — `remotion-video-templates/safe-area-layout`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-video-templates` (`templates/remotion-components/remotion-video-templates`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Своей картинки нет: доли «безопасной зоны» кадра для 16:9 и 9:16 и две
обёртки над `AbsoluteFill` — центрирование и отступ safe area.

## Когда использовать

Титры, подписи, субтитры и CTA, которые не должны попасть под интерфейс
TikTok/Reels или overscan; быстро центрировать контент в кадре.

## Фразы из озвучки

- «подпись внизу экрана»
- «субтитры над панелью приложения»
- «всё важное — в центре кадра»

## Визуальный стиль

Нейтральный.

## Входные данные

`SAFE_AREA {horizontal 0.05, vertical 0.05}`, `SHORT_SAFE_AREA {horizontal
0.06, top 0.08, bottom 0.14}`, `safeInsetPx(width, height) → {x, y}`,
`<Center style?>`, `<SafeArea justify="flex-end" align="flex-start" style?>`.

## Анимации

Нет.

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/lib/layout.tsx`

## Зависимости

`react`, `remotion` (`AbsoluteFill`).

## Совместимость и адаптация

`native`, копируется как есть.

## Паттерны

`spatial`
