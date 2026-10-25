// Свойства вкладок Video Workspace Phase 4–6 (Task 35′): VideoWorkspace — реестр 35′, поэтому
// вкладки получают сразу всё нужное — данные проекта, позицию плеера, переход к моменту исходника
// и обновление после изменений. Задачи 40, 5L, 45 заменяют тело вкладки, не свойства.
import type { VideoProjectDto } from "@ms/contracts";

export interface VideoTabProps {
  data: VideoProjectDto;
  /** Позиция плеера в исходнике, µs. */
  currentUs: number;
  /** Перейти к моменту исходника, µs. */
  onSeek: (sourceUs: number) => void;
  /** Данные проекта изменились (перечитать). */
  onChanged: () => void;
}
