# Contributing / 贡献指南

This repository accepts original, reusable live-action workflows for HiAPI's `seedance-2.0` model.

本仓库接收面向 HiAPI `seedance-2.0` 模型的原创、可复用真人写实工作流。

## What We Accept / 接收内容

- Cinematic shots, everyday life, adult performance, dialogue scenes, and documentary/UGC workflows.
- Original prompts with a clear directorial intent, reference-role map, timed beats, sound plan, continuity lock, and failure fixes.
- English and Chinese copy that describe the same production plan rather than unrelated variants.
- Preview media only when the contributor owns it or has permission to publish it.

- 电影镜头、生活场景、成年人物表演、对话场景、纪实与 UGC 工作流。
- 包含导演意图、参考素材角色、时间轴、声音、连续性和失败修复的原创提示词。
- 中英文必须表达同一制作方案，不能是无关的两个版本。
- 预览素材必须由贡献者拥有版权或已取得公开授权。

## What We Do Not Accept / 不接收内容

- Celebrity likeness, unconsented real-person identity, voice cloning without permission, or deceptive impersonation.
- Prompts copied from creators without permission or clear compatible licensing.
- Named film/TV/game characters used as the core of a workflow; submit an original, IP-clean version instead.
- Explicit sexual content, graphic violence, minors in risky scenarios, hidden advertising, or unverifiable performance claims.
- Large raw media files without clear value and attribution.

- 未经许可的名人肖像、真人身份、声音克隆或欺骗性冒充。
- 未获许可或没有兼容许可证的搬运提示词。
- 以影视、游戏角色名称为核心的工作流；请改为原创、去 IP 版本。
- 露骨色情、血腥暴力、未成年人高风险场景、隐性广告或无法验证的效果承诺。
- 没有明确价值和署名的大体积原始媒体。

## Data-First Workflow / 数据优先

Do not edit generated README or workflow pages directly.

不要直接编辑自动生成的 README 或工作流页面。

1. Edit `data/workflows.json`.
2. Run `npm run build`.
3. Run `npm test`.
4. Review the generated English and Chinese pages.

## Required Workflow Fields / 必需字段

Every workflow must include:

- a unique kebab-case `id`;
- category, mode, duration, ratio, resolution, and difficulty;
- directorial intent in English and Chinese;
- explicit asset roles and media-mode placeholders;
- at least two timed beats;
- sound direction;
- English and Chinese prompts;
- continuity locks;
- at least two one-variable failure fixes.

每条工作流必须包含：唯一 kebab-case `id`、类别、模式、时长、比例、分辨率、难度、中英文导演意图、明确的素材角色和媒体占位符、至少两个时间轴节拍、声音设计、中英文提示词、连续性锁定，以及至少两条“一次只改一个变量”的失败修复。

## Pull Request Checklist / PR 自检

- [ ] The workflow is original and IP-clean.
- [ ] All depicted people are adults, or the scenario is clearly safe and age-appropriate.
- [ ] Any real-person identity, voice, product, or media has permission.
- [ ] HiAPI request fields match the selected media mode.
- [ ] `npm test` passes.
- [ ] Generated files are committed.

