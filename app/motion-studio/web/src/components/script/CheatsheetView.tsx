// Шпаргалка пакета «сцена ↔ фраза» (S9, спека §9 п.4): .md показывается таблицами по блокам
// (разбор `parseCheatsheet`, текст ячеек — простой текст, не HTML), .csv и .txt — скачать.
// Таблица сворачивается; свёрнутая не загружается.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { scriptUrls } from "../../api/script-client.js";
import { t } from "../../i18n/index.js";
import { parseCheatsheet } from "../../script/output.js";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { accept: "text/markdown, text/plain" }, credentials: "same-origin" });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.text();
}

export function CheatsheetView({ packageId, defaultOpen = true }: { packageId: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const md = useQuery({
    queryKey: ["scriptCheatsheet", packageId],
    queryFn: () => fetchText(scriptUrls.cheatsheet(packageId, "md")),
    staleTime: Infinity,
    enabled: open,
  });
  const parts = md.data ? parseCheatsheet(md.data) : [];
  return (
    <section className="cheatsheet" aria-label={t("scriptOutput.cheatsheet.title")}>
      <div className="row wrap">
        <h4>{t("scriptOutput.cheatsheet.title")}</h4>
        <span className="spacer" />
        <a className="button" href={scriptUrls.cheatsheet(packageId, "md")} target="_blank" rel="noreferrer">{t("scriptOutput.cheatsheet.md")}</a>
        <a className="button" href={scriptUrls.cheatsheet(packageId, "csv")} download>{t("scriptOutput.cheatsheet.csv")}</a>
        <a className="button" href={scriptUrls.cheatsheet(packageId, "txt")} download>{t("scriptOutput.cheatsheet.txt")}</a>
      </div>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>{t(open ? "scriptOutput.cheatsheet.hide" : "scriptOutput.cheatsheet.show")}</summary>
        {md.isError ? <p className="muted small">{t("scriptOutput.cheatsheet.unavailable")}</p> : null}
        {open && !md.data && !md.isError ? <p className="muted small">{t("common.loading")}</p> : null}
        <div className="cheatsheet-body">
          {parts.map((p, i) => {
            if (p.kind === "heading") {
              // заголовок документа — уже в карточке пакета; блоки — подзаголовками
              if (p.level === 1) return null;
              return <h5 key={i} className="cheatsheet-block">{p.text}</h5>;
            }
            if (p.kind === "text") return <p key={i} className="small muted">{p.text}</p>;
            return (
              <div key={i} className="table-scroll">
                <table className="cheatsheet-table">
                  <thead><tr>{p.head.map((h, k) => <th key={k} scope="col">{h}</th>)}</tr></thead>
                  <tbody>{p.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}
