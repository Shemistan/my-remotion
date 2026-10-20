---
тип: adr
статус: предложено
обновлено: 2026-10-20
---

# Motion Studio — отдельное Node/TS-приложение в my-remotion

**Контекст.** В ai-platform уже есть «Моушн» и «Монтаж» (Python stdlib, ванильный JS,
сцены на HyperFrames/GSAP). ТЗ требует Remotion, React/TS и Knowledge Base из
my-remotion, durable jobs и иммутабельные версии. ТЗ §16.3 запрещает менять
ai-platform без согласования.

**Решение.** Строим `app/motion-studio/` в my-remotion (вариант A из
`docs/architecture/03-target-architecture.md` §1). ai-platform используем как
поставщика ASR через CLI-воркер и, опционально, изображений через HTTP. Движок сцен
(`contracts/` + `render/`) не зависит от HTTP и БД, чтобы позже его мог вызвать и
ai-platform (вариант C).

**Последствия.** Один тулчейн с Remotion; ai-platform не меняется. Часть логики
«Монтажа» (вырезки, раскадровка) пишется заново в Phase 2–3. Два продукта с близкой
целью сосуществуют, пока человек не решит иначе.
