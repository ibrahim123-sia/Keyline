"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createUpload, getMediaStatuses } from "@/features/media/actions";
import type { MediaItem } from "@/features/media/queries";
import { averageColor, convertHeic, isHeicFile, putWithProgress } from "./upload-utils";

export type UploadPhase = "queued" | "preparing" | "uploading" | "processing" | "done" | "failed";

export type UploadEntry = {
  key: string;
  name: string;
  size: number;
  phase: UploadPhase;
  /** Bytes sent, 0..1. */
  progress: number;
  error?: string;
  result?: MediaItem;
};

type Job = { key: string; file: File; replace?: MediaItem };

const CONCURRENCY = 3;
const POLL_MS = 800;
const PROCESS_TIMEOUT_MS = 120_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload queue for the media library and pickers (07 §8): converts HEIC, measures the
 * placeholder colour, asks for a signed link, PUTs the bytes with progress, then waits for
 * the processing job. Three files at a time.
 */
export function useUploader(options: { folder: string; onUploaded?: (item: MediaItem) => void }) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const queue = useRef<Job[]>([]);
  const running = useRef(0);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const update = useCallback((key: string, patch: Partial<UploadEntry>) => {
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }, []);

  const runOne = useCallback(
    async ({ key, file, replace }: Job) => {
      const fail = (error: string) => update(key, { phase: "failed", error });
      update(key, { phase: "preparing" });
      let upload = file;
      if (isHeicFile(file)) {
        try {
          upload = await convertHeic(file);
        } catch {
          return fail(
            "This HEIC photo could not be converted here. Export it as JPEG and try again.",
          );
        }
      }
      const color = await averageColor(upload);
      const created = await createUpload({
        fileName: upload.name,
        size: upload.size,
        folder: optionsRef.current.folder,
        color,
        replaceId: replace?.id ?? null,
      }).catch(() => null);
      if (!created) return fail("Could not reach the server. Try again.");
      if (!created.ok) return fail(created.error);

      update(key, { phase: "uploading", name: upload.name, size: upload.size });
      const sent = await putWithProgress(created.data.uploadUrl, upload, (progress) =>
        update(key, { progress }),
      );
      if (!sent.ok) return fail(sent.error);

      update(key, { phase: "processing", progress: 1 });
      const deadline = Date.now() + PROCESS_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await sleep(POLL_MS);
        const res = await getMediaStatuses({ ids: [created.data.id] }).catch(() => null);
        if (!res?.ok) continue;
        const item = res.data[0];
        if (!item) return fail("The file was deleted while it was processing.");
        if (replace) {
          // A replacement leaves the old file live until it is done; any change ends the wait.
          if (item.updatedAt === replace.updatedAt) continue;
          if (item.processingError) return fail(item.processingError);
        } else if (item.status === "failed") {
          return fail(item.processingError ?? "The file could not be processed.");
        } else if (item.status !== "ready") {
          continue;
        }
        update(key, { phase: "done", result: item });
        optionsRef.current.onUploaded?.(item);
        return;
      }
      fail("Processing is taking longer than usual. Refresh the page in a minute.");
    },
    [update],
  );

  // Up to three workers, each taking files from the queue until it is empty. A worker's exit
  // (empty queue -> running--) has no await in between, so a file added meanwhile is never lost.
  const startWorkers = useCallback(() => {
    while (running.current < CONCURRENCY && queue.current.length > 0) {
      running.current++;
      void (async () => {
        try {
          for (let job = queue.current.shift(); job; job = queue.current.shift()) {
            await runOne(job);
          }
        } finally {
          running.current--;
        }
      })();
    }
  }, [runOne]);

  const add = useCallback(
    (files: File[], replace?: MediaItem) => {
      const jobs = files.map((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        replace,
      }));
      setEntries((list) => [
        ...jobs.map((j) => ({
          key: j.key,
          name: j.file.name,
          size: j.file.size,
          phase: "queued" as const,
          progress: 0,
        })),
        ...list,
      ]);
      queue.current.push(...jobs);
      startWorkers();
    },
    [startWorkers],
  );

  const clearFinished = useCallback(() => {
    setEntries((list) => list.filter((e) => e.phase !== "done" && e.phase !== "failed"));
  }, []);

  const busy = entries.some((e) => e.phase !== "done" && e.phase !== "failed");
  return { entries, add, clearFinished, busy };
}
