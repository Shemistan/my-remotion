// Список проектов Dashboard (Task 47): поиск по названию, фильтр «активные / архив / корзина»,
// переименование на месте, меню действий (переименовать, в архив / из архива, удалить в корзину
// с подтверждением). Проект Playground по умолчанию не архивируется и не удаляется.
import type { ProjectDto } from "@ms/contracts";
import { useState } from "react";
import { type ProjectView, dateTime, useArchive, useProjectList } from "../../api/projects-client.js";
import { errorText, t } from "../../i18n/index.js";
import { Link } from "../Link.js";
import { DeleteDialog } from "./DeleteDialog.js";
import { RenameDialog } from "./RenameDialog.js";
import { TrashList } from "./TrashList.js";

type Filter = ProjectView | "trash";
const FILTERS: Filter[] = ["active", "archived", "trash"];
const PROTECTED = "playground";

function Actions({ p, archived, onRename, onDelete }: { p: ProjectDto; archived: boolean; onRename: () => void; onDelete: () => void }) {
  const archive = useArchive();
  const [open, setOpen] = useState(false);
  const run = (f: () => void) => () => { setOpen(false); f(); };
  return (
    <span className="row">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t("projects.actions", { title: p.title })} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open ? (
        <span role="menu" className="row">
          <button type="button" role="menuitem" onClick={run(onRename)}>{t("projects.rename")}</button>
          {p.id === PROTECTED ? null : (
            <>
              <button type="button" role="menuitem" disabled={archive.isPending} onClick={run(() => archive.mutate({ id: p.id, archived: !archived }))}>
                {archived ? t("projects.unarchive") : t("projects.archive")}
              </button>
              <button type="button" role="menuitem" onClick={run(onDelete)}>{t("projects.delete")}</button>
            </>
          )}
        </span>
      ) : null}
      {archive.isError ? <span className="error">{errorText(archive.error)}</span> : null}
    </span>
  );
}

function Projects({ view, filter }: { view: ProjectView; filter: string }) {
  const list = useProjectList(view);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProjectDto | null>(null);
  const q = filter.trim().toLowerCase();
  const items = (list.data ?? []).filter((p) => !q || p.title.toLowerCase().includes(q));
  return (
    <>
      {list.isError ? <p className="error">{errorText(list.error)}</p> : null}
      {list.isPending ? <p className="muted">{t("common.loading")}</p> : null}
      {list.data?.length === 0 && !list.isError ? <p className="muted">{view === "archived" ? t("projects.noArchived") : t("dashboard.noProjects")}</p> : null}
      {list.data && list.data.length > 0 && items.length === 0 ? <p className="muted">{t("projects.noMatches")}</p> : null}
      <ul className="project-list">
        {items.map((p) => (
          <li key={p.id} data-project-id={p.id}>
            {renaming === p.id ? (
              <RenameDialog id={p.id} title={p.title} onClose={() => setRenaming(null)} />
            ) : (
              <>
                <Link to={{ name: "project", id: p.id }} className="strong">{p.title}</Link>
                <span className="badge">{t(`project.kind.${p.kind}`)}</span>
                <span className="muted small">{t("dashboard.updated", { at: dateTime(p.updated_at) })}</span>
                <Actions p={p} archived={view === "archived"} onRename={() => setRenaming(p.id)} onDelete={() => setDeleting(p)} />
              </>
            )}
          </li>
        ))}
      </ul>
      {deleting ? <DeleteDialog id={deleting.id} title={deleting.title} onClose={() => setDeleting(null)} /> : null}
    </>
  );
}

export function ProjectList() {
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  return (
    <div className="stack">
      <div className="row wrap">
        <div className="segmented" role="group" aria-label={t("projects.filterLabel")}>
          {FILTERS.map((f) => (
            <button key={f} type="button" className={filter === f ? "active" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {t(`projects.filter.${f}`)}
            </button>
          ))}
        </div>
        <input type="search" className="grow" aria-label={t("projects.search")} placeholder={t("projects.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {filter === "trash" ? <TrashList filter={search} /> : <Projects key={filter} view={filter} filter={search} />}
    </div>
  );
}
