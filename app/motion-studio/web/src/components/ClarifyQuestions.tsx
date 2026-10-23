// Уточняющие вопросы Concept (задача `awaiting_input`): ответ по каждому вопросу или
// «Пропустить» — тогда агент берёт значения по умолчанию. Ответы — по индексу вопроса.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { api } from "../api/client.js";
import { errorText, t } from "../i18n/index.js";

export interface ClarifyQuestionsProps {
  jobId: string;
  questions: { question: string; default_if_skipped: string }[];
}

export function ClarifyQuestions({ jobId, questions }: ClarifyQuestionsProps) {
  const id = useId();
  const client = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const send = useMutation({
    mutationFn: (body: { answers: Record<string, string> } | { skip: true }) => api.jobInput(jobId, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["job", jobId] });
      void client.invalidateQueries({ queryKey: ["scene"] });
    },
  });
  const filled = Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));

  return (
    <section className="panel clarify" aria-label={t("clarify.title")}>
      <h2>{t("clarify.title")}</h2>
      <p className="hint">{t("clarify.hint")}</p>
      {questions.map((q, i) => (
        <div key={i} className="form-row">
          <label htmlFor={`${id}-${i}`}>{q.question}</label>
          <input id={`${id}-${i}`} value={answers[String(i)] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [String(i)]: e.target.value }))} />
          <span className="hint">{t("clarify.default", { value: q.default_if_skipped })}</span>
        </div>
      ))}
      {send.isError ? <p className="error">{errorText(send.error)}</p> : null}
      <div className="row">
        <button type="button" className="primary" disabled={send.isPending || Object.keys(filled).length === 0} onClick={() => send.mutate({ answers: filled })}>
          {t("clarify.answer")}
        </button>
        <button type="button" disabled={send.isPending} onClick={() => send.mutate({ skip: true })}>{t("clarify.skip")}</button>
      </div>
    </section>
  );
}
