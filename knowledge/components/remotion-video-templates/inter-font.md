# Шрифт Inter — `remotion-video-templates/inter-font`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-video-templates` (`templates/remotion-components/remotion-video-templates`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | `external-service` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE); сам шрифт Inter — OFL (Google Fonts) |

## Что визуализирует

Своей картинки нет: один модуль загружает Inter через
`@remotion/google-fonts` и экспортирует `INTER` (fontFamily) для всех шаблонов.

## Когда использовать

Любой текст в ролике, где нужен гарантированно загруженный шрифт до захвата
кадров (без мигания fallback-шрифта).

## Фразы из озвучки

- «чистая современная типографика»
- «текст на экране в едином стиле»
- «заголовок крупным жирным шрифтом»

## Визуальный стиль

Inter, начертания 400/500/600/700/800, subset `latin`.

## Входные данные

`loadFont("normal", { weights: ["400","500","600","700","800"], subsets:
["latin"] })` → `export const INTER`.

## Анимации

Нет.

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/lib/fonts.ts`

## Зависимости

`@remotion/google-fonts` (4.0.200).

## Совместимость и адаптация

`native`: `loadFont` регистрирует delayRender-ожидание сам. Флаг
`external-service` — шрифт тянется с Google Fonts при рендере; для
кириллицы добавить subset `cyrillic`, для офлайн-рендера — локальный шрифт
через `staticFile` + `@remotion/fonts`.

## Паттерны

`key-point-emphasis`
