# Spring presets — `remotion-video-templates/spring-presets`

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

Своей картинки нет: три именованных конфига `spring()` для единого
«характера» движения во всех шаблонах пакета.

## Когда использовать

Чтобы сцены ролика двигались согласованно: `SNAPPY` — UI, титры, выноски;
`GENTLE` — фоны, медленные панорамы, Ken Burns; `BOUNCE` — один «герой»
сцены (логотип, акцент).

## Фразы из озвучки

- «чётко и по делу» (SNAPPY)
- «спокойно, без суеты» (GENTLE)
- «вот оно!» — акцентный выпрыг (BOUNCE)

## Визуальный стиль

SNAPPY: быстрое оседание почти без перелёта; GENTLE: медленно, без отскока;
BOUNCE: перелёт и покачивание.

## Входные данные

`Partial<SpringConfig>`: `SNAPPY {mass 0.6, stiffness 180, damping 20}`,
`GENTLE {mass 1, stiffness 60, damping 26}`, `BOUNCE {mass 0.8, stiffness
140, damping 9}`. Использование: `spring({ frame, fps, config: SNAPPY })`.

## Анимации

Нет собственных — параметры для `spring` из `remotion`.

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/lib/springs.ts`

## Зависимости

`remotion` (тип `SpringConfig`).

## Совместимость и адаптация

`native`, копируется как есть.

## Паттерны

`key-point-emphasis`
