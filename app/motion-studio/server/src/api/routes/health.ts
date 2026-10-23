// `GET /api/health` — режим хранилища и доступность инструментов (`03` §7 п. 5). Без побочных
// эффектов и без запуска моделей: бинарники ищутся в PATH, Chrome — `findRenderBrowser` (без
// загрузки). Глубокая проверка (вход Claude, энкодеры) — `npm run doctor`. Ответ инструментов
// кэшируется на 30 с.
import { isAbsolute } from "node:path";
import { access, constants } from "node:fs/promises";
import { type Capability, HealthDtoSchema } from "@ms/contracts";
import { findOnPath, findRenderBrowser } from "@ms/render";
import type { ApiContext, ZApp } from "../context.js";

const TTL_MS = 30_000;

async function binary(name: string): Promise<Capability> {
  if (isAbsolute(name)) {
    return access(name, constants.X_OK).then(
      () => ({ status: "ok", detail: name }),
      () => ({ status: "unavailable", detail: `${name} не найден или не исполняемый` }),
    );
  }
  const p = await findOnPath(name);
  return p ? { status: "ok", detail: p } : { status: "unavailable", detail: `${name} не найден в PATH` };
}

export interface HealthProbes {
  claude(): Promise<Capability>;
  chrome(): Promise<Capability>;
  ffmpeg(): Promise<Capability>;
}

export function defaultProbes(claudeBin: string): HealthProbes {
  return {
    claude: () => binary(claudeBin),
    chrome: async () => {
      try {
        return { status: "ok", detail: findRenderBrowser() };
      } catch (e) {
        return { status: "unavailable", detail: (e as Error).message };
      }
    },
    ffmpeg: async () => {
      const [a, b] = await Promise.all([binary("ffmpeg"), binary("ffprobe")]);
      return a.status === "ok" && b.status === "ok" ? a : { status: "unavailable", detail: [a, b].filter((x) => x.status !== "ok").map((x) => x.detail).join("; ") };
    },
  };
}

export function healthRoutes(app: ZApp, { core }: ApiContext, probes: HealthProbes = defaultProbes(core.config.claudeBin)): void {
  let cached: { at: number; value: Promise<{ claude: Capability; chrome: Capability; ffmpeg: Capability }> } | undefined;
  const tools = () => {
    if (!cached || Date.now() - cached.at > TTL_MS) {
      cached = { at: Date.now(), value: Promise.all([probes.claude(), probes.chrome(), probes.ffmpeg()]).then(([claude, chrome, ffmpeg]) => ({ claude, chrome, ffmpeg })) };
    }
    return cached.value;
  };

  app.get("/api/health", { schema: { response: { 200: HealthDtoSchema } } }, async () => {
    const mode = core.storage.mode();
    const reason = core.storage.reason();
    return {
      storage: mode,
      ...(mode === "storage_offline" && reason ? { storage_reason: reason } : {}),
      ...(await tools()),
      owner: core.owner,
    };
  });
}
