// Чат сцены: сообщения пользователя, ассистента и системы (только текст, без разметки);
// предупреждения в ответах (например, «Темп не сохранён») выделены. Отправка — правка сцены
// (`POST /scenes/:id/messages` с Idempotency-Key; один ключ на одно нажатие).
import type { ChatMessage, HistoryEntry } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api, newKey } from "../api/client.js";
import { useMessages } from "../api/queries.js";
import { errorText, t } from "../i18n/index.js";

export interface ChatProps {
  sceneId: string;
  /** Версия, от которой считать правку (открытая в плеере). */
  baseVersionId?: string;
  versions?: HistoryEntry[];
  onOpenVersion?: (versionId: string) => void;
  disabled?: boolean;
}

const markers = () => t("chat.warningPrefixes").split("|").map((s) => s.trim()).filter(Boolean);

function MessageText({ text, role }: { text: string; role: ChatMessage["role"] }) {
  const warn = role === "user" ? [] : markers();
  return (
    <div className="msg-text">
      {text.split("\n").map((line, i) =>
        warn.some((m) => line.startsWith(m)) ? (
          <p key={i} className="msg-warning" data-warning="">{line}</p>
        ) : (
          <p key={i}>{line}</p>
        ),
      )}
    </div>
  );
}

export function Chat({ sceneId, baseVersionId, versions = [], onOpenVersion, disabled }: ChatProps) {
  const id = useId();
  const client = useQueryClient();
  const messages = useMessages(sceneId);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const send = useMutation({
    mutationFn: (v: { text: string; key: string }) => api.sendMessage(sceneId, { text: v.text, ...(baseVersionId ? { baseVersionId } : {}) }, v.key),
    onSuccess: () => {
      setText("");
      void client.invalidateQueries({ queryKey: ["messages", sceneId] });
      void client.invalidateQueries({ queryKey: ["scene", sceneId] });
    },
  });
  const list = messages.data ?? [];
  // тело блоком: в новых Chrome scrollIntoView возвращает Promise, а React ждёт от эффекта
  // только функцию очистки или undefined
  useEffect(() => {
    void end.current?.scrollIntoView?.({ block: "end" });
  }, [list.length]);
  const number = (vid: string | undefined) => versions.find((v) => v.version_id === vid)?.number;

  const submit = () => {
    const v = text.trim();
    if (!v || send.isPending) return;
    send.mutate({ text: v, key: newKey() });
  };

  return (
    <section className="panel chat" aria-label={t("chat.title")}>
      <h2>{t("chat.title")}</h2>
      <div className="chat-log">
        {messages.isError ? <p className="error">{errorText(messages.error)}</p> : null}
        {list.length === 0 && messages.isSuccess ? <p className="muted">{t("chat.empty")}</p> : null}
        {list.map((m) => (
          <article key={m.id} className={`msg msg-${m.role}`}>
            <header>
              <span className="msg-role">{t(`chat.role.${m.role}`)}</span>
              {m.version_id && number(m.version_id) !== undefined ? (
                <button type="button" className="link" onClick={() => onOpenVersion?.(m.version_id!)}>
                  {t("versions.label", { n: number(m.version_id)! })}
                </button>
              ) : null}
            </header>
            <MessageText text={m.text} role={m.role} />
          </article>
        ))}
        <div ref={end} />
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label htmlFor={id} className="sr-only">{t("chat.input")}</label>
        <textarea
          id={id}
          rows={3}
          value={text}
          placeholder={t("chat.placeholder")}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="row">
          {send.isError ? <span className="error">{errorText(send.error)}</span> : <span className="hint">{t("chat.hint")}</span>}
          <button type="submit" className="primary" disabled={disabled || !text.trim() || send.isPending}>{t("chat.send")}</button>
        </div>
      </form>
    </section>
  );
}
