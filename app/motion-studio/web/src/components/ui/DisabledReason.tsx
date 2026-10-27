import { cloneElement, isValidElement, type ReactElement, useId } from "react";
import { t, type TKey } from "../../i18n/index.js";

export function DisabledReason({ reasonKey, params, children }: {
  reasonKey?: TKey | null;
  params?: Record<string, string | number>;
  children: ReactElement<{ "aria-describedby"?: string }>;
}) {
  const id = useId();
  if (!isValidElement(children)) return children;
  const described = [children.props["aria-describedby"], id].filter(Boolean).join(" ");
  return (
    <span className={`disabled-reason${reasonKey ? " has-reason" : ""}`}>
      {cloneElement(children, { "aria-describedby": reasonKey ? described : children.props["aria-describedby"] })}
      {reasonKey ? <span id={id} className="disabled-reason-text" role="status">{t(reasonKey, params)}</span> : null}
    </span>
  );
}
