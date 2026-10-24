// Idempotency-Key задач Video Workspace (ревью Task 29 C1, I2): только ASCII не длиннее 200
// символов, как бы ни выглядели путь, имя файла и подсказки (кириллица, пробелы, длинный
// путь); новый ключ на каждую попытку — повтор «Распознать речь» после завершения создаёт новую
// задачу, повтор импорта после ошибки — тоже.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AsrStatus } from "../../src/components/video/AsrStatus.js";
import { MediaImport } from "../../src/components/video/MediaImport.js";
import { t } from "../../src/i18n/index.js";
import { type Call, fakeFetch, job, on, renderQ } from "../helpers.js";

afterEach(() => vi.unstubAllGlobals());

const ASCII_KEY = /^[\x21-\x7e]{1,200}$/;
const posts = (calls: Call[]) => calls.filter((c) => c.method === "POST");
const LONG_PATH = `/Volumes/External SSD/${"Очень длинная папка с записями экрана/".repeat(8)}Запись экрана 1.mp4`;

it("импорт по пути с кириллицей, пробелами и длиной > 200: ключ ASCII ≤ 200; после ошибки — новый ключ", async () => {
  let n = 0;
  const { calls } = fakeFetch([
    (c) => (c.method === "POST" && c.url === "/api/projects/p1/media/import"
      ? (++n === 1 ? { status: 409, body: { error: "import_in_progress", message: "идёт" } } : { status: 202, body: { job: job({ type: "media.import" }) } })
      : undefined),
  ]);
  const onJob = vi.fn();
  renderQ(<MediaImport projectId="p1" onJob={onJob} />);
  fireEvent.change(screen.getByLabelText(t("media.pathLabel")), { target: { value: LONG_PATH } });
  fireEvent.click(screen.getByRole("button", { name: t("media.importButton") }));
  await screen.findByText(/идёт/);
  fireEvent.click(screen.getByRole("button", { name: t("media.importButton") }));
  await waitFor(() => expect(onJob).toHaveBeenCalledWith("job_1"));
  const [a, b] = posts(calls);
  expect(a!.headers["idempotency-key"]).toMatch(ASCII_KEY);
  expect(b!.headers["idempotency-key"]).toMatch(ASCII_KEY);
  expect(a!.headers["idempotency-key"]).not.toBe(b!.headers["idempotency-key"]);
  expect(a!.body).toEqual({ path: LONG_PATH });
});

/** Фейковый XMLHttpRequest: заголовки — как браузер (не ByteString — исключение), ответ 202. */
function fakeXhr() {
  const sent: { url: string; headers: Record<string, string> }[] = [];
  class Xhr {
    upload = { onprogress: null as unknown };
    status = 0;
    statusText = "";
    responseText = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private url = "";
    private headers: Record<string, string> = {};
    open(_m: string, url: string) {
      this.url = url;
    }
    setRequestHeader(k: string, v: string) {
      if ([...v].some((ch) => ch.charCodeAt(0) > 255)) throw new TypeError(`Cannot convert argument to a ByteString: ${k}`);
      this.headers[k] = v;
    }
    send() {
      sent.push({ url: this.url, headers: this.headers });
      setTimeout(() => {
        this.status = 202;
        this.responseText = JSON.stringify({ job: job({ id: `job_u${sent.length}`, type: "media.import" }) });
        this.onload?.();
      }, 0);
    }
  }
  vi.stubGlobal("XMLHttpRequest", Xhr);
  return sent;
}

it("загрузка файла «Запись экрана 1.mp4»: ключ ASCII; вторая загрузка — новый ключ", async () => {
  fakeFetch();
  const sent = fakeXhr();
  const onJob = vi.fn();
  const { container } = renderQ(<MediaImport projectId="p1" onJob={onJob} />);
  const input = container.querySelector("input[type=file]") as HTMLInputElement;
  const file = new File([new Uint8Array(10)], "Запись экрана 1.mp4", { type: "video/mp4" });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(onJob).toHaveBeenCalledWith("job_u1"));
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(onJob).toHaveBeenCalledWith("job_u2"));
  expect(sent).toHaveLength(2);
  expect(sent[0]!.url).toBe(`/api/projects/p1/media/upload?name=${encodeURIComponent("Запись экрана 1.mp4")}`);
  for (const s of sent) expect(s.headers["idempotency-key"]).toMatch(ASCII_KEY);
  expect(sent[0]!.headers["idempotency-key"]).not.toBe(sent[1]!.headers["idempotency-key"]);
});

it("«Распознать речь» с подсказками на кириллице: ключ ASCII; повтор после завершения — новый ключ (новая задача)", async () => {
  let n = 0;
  const { calls } = fakeFetch([
    on("GET", "/api/asr/capability", { available: true, model: "parakeet" }),
    (c) => (c.method === "POST" && c.url === "/api/media/med_1/transcribe" ? { status: 202, body: { job: job({ id: `job_a${++n}`, type: "asr.transcribe" }) } } : undefined),
  ]);
  const onJob = vi.fn();
  renderQ(<AsrStatus mediaId="med_1" busy={false} onJob={onJob} />);
  fireEvent.change(screen.getByLabelText(t("asr.hotwords")), { target: { value: "выручка, гипотеза, Авито Аналитика" } });
  fireEvent.click(screen.getByRole("button", { name: t("asr.transcribe") }));
  await waitFor(() => expect(onJob).toHaveBeenCalledWith("job_a1"));
  fireEvent.click(screen.getByRole("button", { name: t("asr.transcribe") }));
  await waitFor(() => expect(onJob).toHaveBeenCalledWith("job_a2"));
  const [a, b] = posts(calls);
  expect(a!.body).toEqual({ language: "ru", hotwords: ["выручка", "гипотеза", "Авито Аналитика"] });
  expect(a!.headers["idempotency-key"]).toMatch(ASCII_KEY);
  expect(b!.headers["idempotency-key"]).toMatch(ASCII_KEY);
  expect(a!.headers["idempotency-key"]).not.toBe(b!.headers["idempotency-key"]);
});
