# LogoIntro — `remotion-video-templates/logo-intro`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-video-templates` (`templates/remotion-components/remotion-video-templates`) |
| Вид | template |
| Категория | `layout-templates` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Логотип (картинка из `public/`) выпрыгивает с перелётом масштаба и
одновременно открывается маской слева направо; за ним мягкое радиальное
свечение цвета бренда и взрыв круглых частиц из центра. В конце — затухание.

## Когда использовать

Начало ролика, заставка бренда/продукта, «удар» перед ключевым кадром.
Если логотипа-картинки нет и нужна текстовая заставка — брать
`kinetic-text` или текстовые шаблоны.

## Фразы из озвучки

- «встречайте — наша компания»
- «это видео подготовлено командой …»
- «добро пожаловать на канал»

## Визуальный стиль

Светлый, «редакционный»: белый фон, синий акцент (`#2563EB`/`#0EA5E9`),
лёгкая drop-shadow. 1920×1080, 30 fps, 90 кадров (3 с, фиксировано).

## Входные данные

zod `logoIntroSchema`:

- `logoSrc: string` — имя файла в `public/` (по умолчанию `"logo.svg"`),
  грузится через `staticFile`;
- `brandColor`, `accentColor`, `backgroundColor: zColor()` — `#2563EB`,
  `#0EA5E9`, `#FFFFFF`;
- `particleCount: int 0..80` — 28.

## Анимации

`spring(BOUNCE)` → scale 0.4→1 и сдвиг Y 24→0; `spring(SNAPPY)` →
`clipPath: inset(0 X% 0 0)`; частицы — общий `spring(BOUNCE, delay 16)`,
угол/дистанция/размер/цвет из `random(seed)`; opacity частиц 0→1→0;
затухание всего слоя за последние 12 кадров.

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/templates/LogoIntro/LogoIntro.tsx`
- `templates/remotion-components/remotion-video-templates/src/lib/springs.ts`, `src/lib/colors.ts`
- `templates/remotion-components/remotion-video-templates/public/logo.svg` — пример логотипа
- `templates/remotion-components/remotion-video-templates/README.md`

## Зависимости

`remotion` (`Img`, `staticFile`, `random`, `spring`, `interpolate`), `zod`,
`@remotion/zod-types`; внутренние `lib/springs`, `lib/colors`.

## Совместимость и адаптация

`native`: всё из `useCurrentFrame`, случайность seeded. Адаптации: положить
свой логотип в `public/`; размер логотипа зашит (460×460).

## Паттерны

`key-point-emphasis`, `abstract-concepts`
