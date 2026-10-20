# Eye Blink Reveal — `free-remotion-templates/eye-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `icons-shapes` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Стилизованный SVG-глаз: веки раскрываются, радужка с лучами и зрачком
вырастает, глаз моргает, под ним всплывает слово-сообщение и подпись.
README обещает «iris reveals your scene», но в коде показывается только
текст — никакой вложенной сцены нет.

## Когда использовать

«Посмотрите внимательно», «правда открылась», раскрытие факта, тема
наблюдения/внимания/видимости. Для перехода между сценами не годится
(вложения нет).

## Фразы из озвучки

- «посмотрите, что скрывалось за цифрами»
- «теперь картина видна целиком»
- «откройте глаза на эту проблему»

## Визуальный стиль

Тёмный slate-фон, белая склера, синяя радужка `#3b82f6`; плоская векторная
графика, системный sans-serif. В Root: 1080×1080, 90 кадров.

## Входные данные

`EyeRevealProps`: `backgroundColor` (`#0f172a`), `scleraColor`, `irisColor`,
`pupilColor`, `lidColor`, `textColor`, `subColor`, `messageText`
(«Revealed»), `subText` («See the truth»).

## Анимации

Раскрытие век 5–35 (`Easing.out(cubic)`), радужка `spring` с кадра 25,
моргание 60–70 (закрытие 60–64, открытие 64–70), текст `spring` scale с 52,
подпись fade 66–80. Форма век — квадратичные кривые от `openAmount`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/eye-reveal/EyeReveal.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`. `clipPath id="eyeClip"` фиксирован — при двух экземплярах на
одном кадре id столкнутся; добавить уникальный суффикс. Чтобы «раскрыть
сцену», надо вложить контент под маску радужки самостоятельно.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
