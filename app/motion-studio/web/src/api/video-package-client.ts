// Клиент API папки клипов видеопроекта (Task 5L): постановка `video.package` с Idempotency-Key,
// список папок проекта, «Показать в Finder», адреса шпаргалки.
import type { CheatsheetQuery, Job, VideoPackageDto } from "@ms/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { request } from "./client.js";

const enc = encodeURIComponent;

export const videoPackageApi = {
  build: (projectId: string, body: { only_approved: boolean }, key: string) =>
    request<{ job: Job }>("POST", `/api/projects/${enc(projectId)}/video/package`, { body, idempotency: key }),
  list: (projectId: string) => request<VideoPackageDto[]>("GET", `/api/projects/${enc(projectId)}/video-packages`),
  reveal: (packageId: string) => request<null>("POST", `/api/video-packages/${enc(packageId)}/reveal`),
};

export const videoPackageUrls = {
  cheatsheet: (packageId: string, format: CheatsheetQuery["format"]) => `/api/video-packages/${enc(packageId)}/cheatsheet?format=${format}`,
};

export const videoPackagesKey = (projectId: string) => ["videoPackages", projectId] as const;

export const useVideoPackages = (projectId: string) =>
  useQuery({ queryKey: videoPackagesKey(projectId), queryFn: () => videoPackageApi.list(projectId) });

export const useBuildVideoPackage = (projectId: string) =>
  useMutation({ mutationFn: ({ onlyApproved, key }: { onlyApproved: boolean; key: string }) => videoPackageApi.build(projectId, { only_approved: onlyApproved }, key) });

export const useRevealVideoPackage = () => useMutation({ mutationFn: (packageId: string) => videoPackageApi.reveal(packageId) });
