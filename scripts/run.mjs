#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "data", "workflows.json"), "utf8"));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const noWait = args.includes("--no-wait");
const quiet = args.includes("--quiet");
const language = args.includes("--zh") ? "zh" : "en";
const apiOrigin = "https://api.hiapi.ai";
const terminalStatuses = new Set(["success", "fail"]);

function usage() {
  console.log(`Usage:
  npm run generate -- <workflow-id> [--dry-run] [--no-wait] [--zh]
  npm run generate -- <workflow-id> --media first_frame_url=YOUR_ASSET_URL
  npm run generate -- <workflow-id> --media reference_image_urls=YOUR_IMAGE_URL --media reference_video_urls=YOUR_VIDEO_URL
  npm run generate -- --list

Environment:
  HIAPI_API_KEY       Required unless --dry-run is used.
  HIAPI_TIMEOUT_MS    Poll timeout in milliseconds. Default: 900000.`);
}

function readOptionValues(name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === name) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
      values.push(value);
      index += 1;
    } else if (arg.startsWith(`${name}=`)) {
      values.push(arg.slice(name.length + 1));
    }
  }
  return values;
}

function parseMediaOverrides() {
  const allowed = new Set([
    "first_frame_url",
    "last_frame_url",
    "reference_image_urls",
    "reference_video_urls",
    "reference_audio_urls",
  ]);
  const arrayKeys = new Set(["reference_image_urls", "reference_video_urls", "reference_audio_urls"]);
  const overrides = {};

  for (const pair of readOptionValues("--media")) {
    const separator = pair.indexOf("=");
    if (separator < 1 || separator === pair.length - 1) throw new Error("--media must use key=value");
    const key = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (!allowed.has(key)) throw new Error(`Unsupported media field: ${key}`);
    if (arrayKeys.has(key)) (overrides[key] ??= []).push(value);
    else overrides[key] = value;
  }

  return overrides;
}

function normalizeMedia(workflow, overrides) {
  const media = structuredClone(workflow.media);
  for (const [key, value] of Object.entries(overrides)) media[key] = value;

  for (const [key, value] of Object.entries(media)) {
    if (Array.isArray(value)) {
      const usable = value.filter((item) => typeof item === "string" && !item.startsWith("asset://"));
      if (usable.length) media[key] = usable;
      else delete media[key];
    }
  }

  return media;
}

function buildPayload(workflow) {
  const media = normalizeMedia(workflow, parseMediaOverrides());
  const payload = {
    model: data.model,
    input: {
      prompt: workflow[`prompt_${language}`],
      duration: workflow.duration,
      resolution: workflow.resolution,
      aspect_ratio: workflow.aspect_ratio,
      generate_audio: true,
      ...media,
    },
  };

  const serialized = JSON.stringify(payload);
  if (serialized.includes("asset://")) {
    throw new Error("This workflow needs media. Replace each required placeholder with --media key=url.");
  }

  const requiredKeys = new Set();
  for (const asset of workflow.asset_roles.filter((item) => item.required)) {
    if (asset.slot.startsWith("@Image")) requiredKeys.add(workflow.mode === "image-to-video" ? "first_frame_url" : "reference_image_urls");
    if (asset.slot.startsWith("@Video")) requiredKeys.add("reference_video_urls");
    if (asset.slot.startsWith("@Audio")) requiredKeys.add("reference_audio_urls");
  }
  for (const key of requiredKeys) {
    if (!media[key] || (Array.isArray(media[key]) && media[key].length === 0)) {
      throw new Error(`This workflow requires --media ${key}=url`);
    }
  }

  return payload;
}

async function apiRequest(pathname, options = {}) {
  const response = await fetch(`${apiOrigin}${pathname}`, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = body?.error?.message ?? body?.message ?? body ?? `HTTP ${response.status}`;
    throw new Error(`HiAPI request failed (${response.status}): ${message}`);
  }
  return body?.data ?? body;
}

async function submitAndWait(payload) {
  const apiKey = process.env.HIAPI_API_KEY?.trim();
  if (!apiKey) throw new Error("HIAPI_API_KEY is required unless --dry-run is used");

  const task = await apiRequest("/v1/tasks", {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify(payload),
  });
  if (!task?.taskId) throw new Error("HiAPI response is missing data.taskId");
  console.log(`taskId: ${task.taskId}`);
  if (noWait) return;

  const timeoutMs = Number(process.env.HIAPI_TIMEOUT_MS || 900000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("HIAPI_TIMEOUT_MS must be a positive number");
  const deadline = Date.now() + timeoutMs;
  let lastStatus;

  while (Date.now() < deadline) {
    const current = await apiRequest(`/v1/tasks/${encodeURIComponent(task.taskId)}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    });
    if (current.status !== lastStatus) {
      console.log(`status: ${current.status}`);
      lastStatus = current.status;
    }
    if (terminalStatuses.has(current.status)) {
      if (current.status === "fail") throw new Error(current.error?.message ?? "Generation failed");
      for (const [index, output] of (current.output ?? []).entries()) {
        if (output?.url) console.log(`output ${index + 1}: ${output.url}`);
      }
      return;
    }
    await delay(3000);
  }

  throw new Error(`Timed out waiting for task ${task.taskId}`);
}

try {
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    process.exit(0);
  }
  if (args.includes("--list")) {
    for (const workflow of data.workflows) console.log(`${workflow.id}\t${workflow.mode}\t${workflow.duration}s\t${workflow.title_en}`);
    process.exit(0);
  }

  const workflowId = args.find((arg) => !arg.startsWith("--") && !arg.includes("="));
  if (!workflowId) {
    usage();
    process.exit(1);
  }
  const workflow = data.workflows.find((item) => item.id === workflowId);
  if (!workflow) throw new Error(`Unknown workflow: ${workflowId}. Run with --list to see valid ids.`);

  const payload = buildPayload(workflow);
  if (dryRun) {
    if (!quiet) console.log(JSON.stringify(payload, null, 2));
  } else {
    await submitAndWait(payload);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
