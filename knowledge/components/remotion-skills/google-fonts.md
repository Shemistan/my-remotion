# Google Fonts — `remotion-skills/google-fonts`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-skills` (`official_skills/skills`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | не указана (нет LICENSE, нет поля license в package.json) |

## Что визуализирует

Не рисует; документ о шрифтах Google через `@remotion/google-fonts`.

## Когда использовать

Любой шрифт из Google Fonts. Рекомендованный путь: типобезопасно и
автоматически блокирует рендер до загрузки шрифта, иначе кадры получают
fallback-шрифт.

```tsx
import { loadFont } from "@remotion/google-fonts/Lobster";
const { fontFamily } = loadFont();
```

## Фразы из озвучки

- «заголовок в фирменном шрифте»
- «крупная типографика на весь экран»
- «стильная надпись»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/google-fonts.md`
- локальные файлы шрифтов — `remotion-skills/local-fonts`

## Зависимости

`@remotion/google-fonts`.

## Совместимость и адаптация

Нет; документ. Рецепт для чужих компонентов, подключающих шрифты через CSS
`@import` или `<link>`.

## Паттерны

нет
