# Remotion traps — `remotion-motion-graphics-skill/traps`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-motion-graphics-skill` (`templates/remotion-components/remotion-motion-graphics-skill`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, README) |

## Что визуализирует

Не рисует; документ о тихих ошибках Remotion, когда код выглядит верно и
ничего не падает.

## Когда использовать

Перед написанием анимации и при самопроверке; при переносе чужих
компонентов. Список:

- `interpolate` по умолчанию `extend` — счётчик уходит за итог; кадр →
  clamp, ремап spring → без clamp (иначе пропадает упругость);
- `extrapolateLeft: 'clamp'` при диапазоне, начинающемся с видимого
  значения, держит эффект с кадра 0 — гейтить по окну `frame >= 72`;
- `backgroundColor` на корневом `AbsoluteFill` убивает альфу;
- `Config.setVideoImageFormat('jpeg')` убивает прозрачность — нужен `png`;
- `spring()` внутри `.map()` ломается при правке массива — выносить в
  дочерний компонент;
- `scaleX` у панели сплющивает текст — `clipPath: inset(0 X% 0 0)`;
- позиционированные элементы рисуются поверх статичных — `position: relative`;
- `transform` не работает на inline `span` — `inline-block`;
- разные версии `@remotion/*`;
- `loadFont()` на несуществующий файл — тихий fallback;
- цифры пляшут — `fontVariantNumeric: 'tabular-nums'`.

## Фразы из озвучки

- «выручка выросла до 12 400»
- «вспышка на ключевом моменте»
- «плашка без фона поверх видео»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Clamp, гейтинг payoff, clip-path-раскрытие, inline-block для transform.

## Исходники и документация

- `templates/remotion-components/remotion-motion-graphics-skill/skills/remotion-motion-graphics/references/traps.md`

## Зависимости

`remotion`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

`quantities`
