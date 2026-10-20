import { mediaProcessJob } from "@/features/media/process";
import { emailSendJob } from "@/features/notifications/email";
import type { JobDefinition } from "./types";

/** Every queue job by name (13-integrations-and-jobs.md §2). */
const jobs: JobDefinition[] = [emailSendJob as JobDefinition, mediaProcessJob as JobDefinition];

const byName = new Map(jobs.map((j) => [j.name, j]));

export function getJob(name: string): JobDefinition | undefined {
  return byName.get(name);
}

export function jobNames(): string[] {
  return [...byName.keys()].sort();
}
