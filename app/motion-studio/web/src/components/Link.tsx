// Внутренняя ссылка: обычный <a href> (открывается в новой вкладке по Cmd-клику), обычный
// клик — переход без перезагрузки.
import type { MouseEvent, ReactNode } from "react";
import { type Route, href, navigate } from "../router.js";

export function Link({ to, children, className, title }: { to: Route; children: ReactNode; className?: string; title?: string }) {
  const url = href(to);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(url);
  };
  return <a href={url} onClick={onClick} className={className} title={title}>{children}</a>;
}
