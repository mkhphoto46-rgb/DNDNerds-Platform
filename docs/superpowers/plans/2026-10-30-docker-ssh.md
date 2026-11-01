# Docker SSH Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task; final independent review required.

**Goal:** Two independently runnable Linux Web/API images, isolated tests and a reversible approved deployment.
**Architecture:** Standalone Next Web plus compiled Fastify API; existing host VTT/proxy/voice and persistent database remain. Private runtime configuration is separate from images.
**Tech Stack:** Docker/Compose, Node24 Debian, PowerShell, OpenSSH, existing PostgreSQL18/Redis7.
**Spec:** User-approved DND_NERDS_DOCKER_SSH_DEPLOY_AGENT_MASTER_PROMPT_2026-10-30.md (private Downloads; not copied into public Git).

## Constraints
Preserve current branch and dirty work, never expose secrets, no migrations/cutover or Docker permission expansion without explicit approval, never prune data. Build locally for amd64 and transfer checksummed image archives. Push only reviewed safe files.

## Review focus
Provider config/readiness disagreement; loopback VTT integration; build context secret exclusion; partial deployment rollback; engine unavailable and honest unrun results.

## Tasks
- [x] Read-only Windows/repo/VPS inventory and risk matrix before implementation.
- [x] Regression tests for effective email selection and Docker-compatible VTT origin; implement minimal fixes.
- [x] Dockerfiles, root allowlist ignore, isolated test and production Compose, health/security/resource controls.
- [x] Reproducible PowerShell clean-source build/save/transfer checks and safe runbooks.
- [ ] Run source tests/builds, Compose validation, images/startup/negative checks when Engine responds. Record each unrun check.
- [ ] Independently review; secret-scan exact staged paths; commit/push and verify remote SHA.
- [ ] Verified private production recovery snapshot and staged images only after prerequisites.
- [ ] Present concrete cutover and rollback; wait for explicit production cutover approval.

Ruling: Current linked worktree is already isolated and clean, on the existing approved feature branch. No branch switch required. Existing VTT/voice work and user source checkout are preserved.

Ruling: user prioritized a production player-admission hotfix on1November. It was reviewed, tested, backed up and explicitly approved for Tadserver publication independently of the still-blocked Docker migration. Docker Engine requests time out; no image/startup/staging/cutover result is claimed.
