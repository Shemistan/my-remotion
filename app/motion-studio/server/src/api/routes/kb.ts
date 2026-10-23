// База визуальных возможностей: поиск (по умолчанию только permissive, top 30) и карточка.
import { KbCardDtoSchema, KbHitDtoSchema } from "@ms/contracts";
import { z } from "zod";
import { type ApiContext, QueryBool, type ZApp } from "../context.js";
import { notFound } from "../errors.js";

const TOP = 30;
const Csv = z.string().transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean));

export function kbRoutes(app: ZApp, { core }: ApiContext): void {
  app.get("/api/kb/search", {
    schema: {
      querystring: z.object({ q: z.string().max(500).default(""), patterns: Csv.optional(), kinds: Csv.optional(), allowRestricted: QueryBool.optional() }).strict(),
      response: { 200: z.array(KbHitDtoSchema) },
    },
  }, async (req) => {
    const { q, patterns, kinds, allowRestricted } = req.query;
    const hits = core.kb.search(q, {
      ...(patterns?.length ? { patterns } : {}),
      ...(kinds?.length ? { kinds } : {}),
      allowRestricted: allowRestricted ?? false,
    }, TOP);
    return hits.map(({ view: v, score }) => ({
      id: v.id, name: v.name, kind: v.kind, patterns: v.patterns, license: v.license, license_class: v.license_class,
      compatibility: v.compatibility_status, repository_url: v.repository_url, commit: v.commit, score,
    }));
  });

  // id записи содержит «/» (`repo/name`): хвост пути целиком
  app.get("/api/kb/*", { schema: { response: { 200: KbCardDtoSchema } } }, async (req) => {
    const id = (req.params as { "*": string })["*"];
    const capability = core.kb.getCapability(id);
    if (!capability) throw notFound(`запись KB ${id}`);
    const card = await core.kb.getComponentCard(id).catch(() => "");
    return { capability: { ...capability }, card };
  });
}
