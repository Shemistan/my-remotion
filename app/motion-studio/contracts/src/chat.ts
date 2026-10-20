import { z } from "zod";

export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  scene_id: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  text: z.string(),
  version_id: z.string().min(1).optional(),
  job_id: z.string().min(1).optional(),
  created_at: z.string().datetime(),
}).strict();
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
