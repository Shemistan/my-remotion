// Делегирование в Codex (спека 2026-11-04-codex-delegation-design.md §3): план долей по ролям,
// статистика чистоты Codex/Claude, паузы; снятие паузы роли. Политику (вкл., уровень) меняет
// `PUT /api/settings`.
import { type Capability, DelegationDtoSchema, type DelegationDto } from "@ms/contracts";
import { z } from "zod";
import { ALWAYS_CLAUDE, UNVERIFIED, planShares } from "../../agents/delegation.js";
import { ROLES, type Role } from "../../agents/runtime.js";
import type { ApiContext, ZApp } from "../context.js";
import { ApiError } from "../errors.js";

const TTL_MS = 60_000;

export function delegationRoutes(app: ZApp, { core }: ApiContext): void {
  let codexCap: { at: number; value: Promise<Capability> } | undefined;
  const router = () => {
    if (!core.delegation) throw new ApiError(409, "conflict", "делегирование недоступно: рантайм агентов подменён");
    return core.delegation;
  };
  const codex = (): Promise<Capability> => {
    if (!codexCap || Date.now() - codexCap.at > TTL_MS) {
      codexCap = {
        at: Date.now(),
        value: router().codexCapabilities().then((c): Capability => (c.available ? { status: "ok", ...(c.version ? { detail: c.version } : {}) } : { status: "unavailable", detail: c.reason ?? "codex недоступен" })),
      };
    }
    return codexCap.value;
  };

  const dto = async (): Promise<DelegationDto> => {
    const r = router();
    const policy = r.getPolicy();
    const weights = r.weights();
    const plan = r.plan();
    const state = r.state();
    const pauses = state.pauses();
    const paused = state.pausedRoles();
    const withUnverified = planShares(weights, { ...policy, allowUnverified: true }, paused);
    return {
      policy,
      level: plan.level,
      minLevel: plan.minLevel,
      maxLevel: plan.maxLevel,
      maxLevelUnverified: withUnverified.maxLevel,
      roles: ROLES.map((role: Role) => {
        const pause = pauses[role];
        const status = ALWAYS_CLAUDE.includes(role) ? ("always_claude" as const)
          : pause ? ("paused" as const)
          : !policy.allowUnverified && UNVERIFIED.includes(role) ? ("unverified" as const)
          : plan.shares[role] > 0 ? ("active" as const) : ("idle" as const);
        return { role, weight: weights[role], share: plan.shares[role], status, ...(pause ? { pause } : {}), stats: state.stats(role) };
      }).sort((a, b) => b.weight - a.weight),
      codex: await codex(),
    };
  };

  app.get("/api/delegation", { schema: { response: { 200: DelegationDtoSchema } } }, dto);

  app.post("/api/delegation/resume/:role", { schema: { params: z.object({ role: z.enum(ROLES) }).strict(), response: { 200: DelegationDtoSchema } } }, async (req) => {
    router().state().resume((req.params as { role: Role }).role);
    return dto();
  });
}
