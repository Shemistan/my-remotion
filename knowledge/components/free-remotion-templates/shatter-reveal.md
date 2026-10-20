# Shatter Reveal — `free-remotion-templates/shatter-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

«Обратное разбиение»: разлетевшиеся и повёрнутые осколки сетки собираются
в цельную плитку с градиентом и крупным заголовком; снизу вытягивается
акцентная полоса и проявляется подзаголовок.

## Когда использовать

Момент «сборки целого из частей», раскрытие решения, разгадка. Заметьте:
по коду это сборка, а не разрушение (README говорит «shatters» — код
делает обратное). Для обычного вайпа — `logo-mask-wipe`.

## Фразы из озвучки

- «из разрозненных фрагментов складывается картина»
- «все кусочки пазла встали на место»
- «и вот ответ»

## Визуальный стиль

Тёмный фон `#050913`, плитка с градиентом синий→фиолетовый→розовый,
белый заголовок weight 900 с тенью, жёлтая полоса `#facc15`. Системный
стек `-apple-system, "Segoe UI", Roboto, sans-serif`. 1920×1080, 120 кадров
(4 с), 30 fps.

## Входные данные

`ShatterRevealProps`: `title` («Reveal»), `subtitle` («Fragments converge
into focus», пустая строка скрывает), `pieces` (36), `spread` (280 px),
`textColor` (`#ffffff`), `background` (`#050913`), `tileBackground`
(CSS-градиент), `accentColor` (`#facc15`).

## Анимации

`interpolate` 2→50 кадр (`Easing.out(Easing.ease)`): смещения и поворот
каждого осколка × (1−progress), opacity осколков = progress; полоса
scaleX 70→100; подзаголовок 60→90. Разброс — собственный LCG
`seededRandom(42)`, детерминирован.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/shatter-reveal/ShatterReveal.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`interpolate`, `Easing`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`; `Math.random` не используется. Каждый осколок рендерит полную
копию плитки (`pieces` копий) — при больших значениях тяжело. Для
«разрушения» развернуть progress (1→0).

## Паттерны

`transformation`, `key-point-emphasis`, `system-structure`
