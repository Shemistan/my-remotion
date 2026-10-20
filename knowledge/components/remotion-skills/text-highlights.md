# Text highlights — `remotion-skills/text-highlights`

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

Не рисует; документ о рисованных «от руки» аннотациях текста через
`@remotion/rough-notation`.

## Когда использовать

Выделить ключевое слово, обвести, подчеркнуть, зачеркнуть устаревшее,
взять в рамку или скобку. Компонент определяет и стиль, и слой (за текстом
или поверх).

## Фразы из озвучки

- «ключевое слово здесь — скорость»
- «обведём самое важное»
- «старый способ больше не работает — зачёркиваем»

## Визуальный стиль

Описываемый визуал — неровные штрихи маркера/ручки поверх текста.

## Входные данные

Нет (документ).

## Анимации

`<Highlight>`, `<Circle>`, `<Underline>`, `<StrikeThrough>`, `<CrossedOff>`,
`<Box>`, `<Bracket>` с `progress` 0..1:

```tsx
<Highlight color="rgba(255, 236, 79, 0.62)"
  progress={interpolate(frame, [15, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}>
  important
</Highlight>
```

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/text-highlights.md`
- https://www.remotion.dev/docs/text-highlights

## Зависимости

`@remotion/rough-notation` (`bunx remotion add @remotion/rough-notation`), `remotion`.

## Совместимость и адаптация

Нет; документ. `progress` держать inline для редактирования в Studio.

## Паттерны

`key-point-emphasis`, `comparison`
