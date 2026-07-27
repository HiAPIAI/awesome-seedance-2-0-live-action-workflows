#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data", "workflows.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const errors = [];
const requiredRepositoryFiles = [
  "assets/cover.svg",
  "docs/research-notes.md",
  "scripts/run.mjs",
];
const allowedModes = new Set(["text-to-video", "image-to-video", "reference-to-video"]);
const allowedRatios = new Set(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"]);
const allowedResolutions = new Set(["480p", "720p", "1080p", "4k"]);
const allowedDifficulty = new Set(["starter", "intermediate", "advanced"]);
const requiredFields = [
  "id", "category", "title_en", "title_zh", "summary_en", "summary_zh",
  "intent_en", "intent_zh", "mode", "duration", "aspect_ratio", "resolution",
  "difficulty", "asset_roles", "beats", "sound_en", "sound_zh", "prompt_en",
  "prompt_zh", "continuity_en", "continuity_zh", "failures", "media",
];

const categoryIds = new Set();
for (const [index, category] of data.categories.entries()) {
  if (!category.id || !category.en || !category.zh) errors.push(`categories[${index}]: missing id/en/zh`);
  if (categoryIds.has(category.id)) errors.push(`categories[${index}]: duplicate id ${category.id}`);
  categoryIds.add(category.id);
}

const workflowIds = new Set();
for (const [index, workflow] of data.workflows.entries()) {
  const where = `workflows[${index}] (${workflow.id ?? "no-id"})`;
  for (const field of requiredFields) {
    if (workflow[field] === undefined || workflow[field] === null || workflow[field] === "") {
      errors.push(`${where}: missing ${field}`);
    }
  }
  if (workflowIds.has(workflow.id)) errors.push(`${where}: duplicate id`);
  workflowIds.add(workflow.id);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workflow.id ?? "")) errors.push(`${where}: id must be kebab-case`);
  if (!categoryIds.has(workflow.category)) errors.push(`${where}: unknown category ${workflow.category}`);
  if (!allowedModes.has(workflow.mode)) errors.push(`${where}: invalid mode ${workflow.mode}`);
  if (!Number.isInteger(workflow.duration) || workflow.duration < 4 || workflow.duration > 15) errors.push(`${where}: duration must be an integer from 4 to 15`);
  if (!allowedRatios.has(workflow.aspect_ratio)) errors.push(`${where}: invalid aspect_ratio ${workflow.aspect_ratio}`);
  if (!allowedResolutions.has(workflow.resolution)) errors.push(`${where}: invalid resolution ${workflow.resolution}`);
  if (!allowedDifficulty.has(workflow.difficulty)) errors.push(`${where}: invalid difficulty ${workflow.difficulty}`);
  if (!Array.isArray(workflow.asset_roles) || workflow.asset_roles.length === 0) errors.push(`${where}: asset_roles must not be empty`);
  if (!Array.isArray(workflow.beats) || workflow.beats.length < 2) errors.push(`${where}: at least two beats are required`);
  if (!Array.isArray(workflow.failures) || workflow.failures.length < 2) errors.push(`${where}: at least two failure fixes are required`);
  if (workflow.prompt_en.length < 220 || workflow.prompt_zh.length < 120) errors.push(`${where}: prompts are too short for a production workflow`);

  let expectedBeatStart = 0;
  for (const [beatIndex, beat] of (workflow.beats ?? []).entries()) {
    const match = /^(\d+)-(\d+)s$/.exec(beat.time ?? "");
    if (!match) {
      errors.push(`${where}: beats[${beatIndex}].time must use start-ends`);
      continue;
    }
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start !== expectedBeatStart || end <= start || end > workflow.duration) {
      errors.push(`${where}: beats[${beatIndex}] must continue from ${expectedBeatStart}s and end within ${workflow.duration}s`);
    }
    expectedBeatStart = end;
  }
  if (expectedBeatStart !== workflow.duration) errors.push(`${where}: beats must cover the full ${workflow.duration}s duration`);

  const mediaKeys = Object.keys(workflow.media ?? {});
  if (workflow.mode === "text-to-video" && mediaKeys.length !== 0) errors.push(`${where}: text-to-video must not define media fields`);
  if (workflow.mode === "image-to-video" && !workflow.media.first_frame_url) errors.push(`${where}: image-to-video requires first_frame_url`);
  if (workflow.mode === "reference-to-video" && !mediaKeys.some((key) => key.startsWith("reference_"))) errors.push(`${where}: reference-to-video requires reference media`);
  if ((workflow.media.first_frame_url || workflow.media.last_frame_url) && mediaKeys.some((key) => key.startsWith("reference_"))) errors.push(`${where}: first/last-frame and reference modes cannot be mixed`);
  if ((workflow.media.reference_image_urls?.length ?? 0) > 9) errors.push(`${where}: reference_image_urls exceeds 9 items`);
  if ((workflow.media.reference_video_urls?.length ?? 0) > 3) errors.push(`${where}: reference_video_urls exceeds 3 items`);
  if ((workflow.media.reference_audio_urls?.length ?? 0) > 3) errors.push(`${where}: reference_audio_urls exceeds 3 items`);
}

for (const categoryId of categoryIds) {
  if (!data.workflows.some((workflow) => workflow.category === categoryId)) errors.push(`category ${categoryId} has no workflows`);
}

for (const relativePath of requiredRepositoryFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) errors.push(`missing repository file ${relativePath}`);
}

const textExtensions = new Set([".md", ".txt", ".json", ".mjs", ".yml", ".yaml"]);
const secretPatterns = [
  /(?<![A-Za-z])sk-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9_]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{24,}/i,
];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (textExtensions.has(path.extname(entry.name))) {
      const content = fs.readFileSync(fullPath, "utf8");
      for (const pattern of secretPatterns) {
        if (pattern.test(content)) errors.push(`${path.relative(root, fullPath)}: secret-like content matches ${pattern}`);
      }
    }
  }
}

walk(root);

const generatedFiles = new Set(data.workflows.map((workflow) => `${workflow.id}.md`));
for (const file of fs.readdirSync(path.join(root, "workflows"))) {
  if (file.endsWith(".md") && !generatedFiles.has(file)) errors.push(`workflows/${file}: not present in data/workflows.json`);
}

if (errors.length) {
  console.error("Validation failed:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}

console.log(`OK: ${data.workflows.length} workflows across ${data.categories.length} categories validated.`);
