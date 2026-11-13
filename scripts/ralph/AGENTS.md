# Ralph iteration: SGS Vercel audio

1. Read root AGENTS.md, tasks/prd-sgs-vercel-audio.md, prior five PRDs, prd.json and progress.txt. Branch: codex/sgs-vercel-audio. Reviewed remote hosting commits are incorporated.
2. Implement exactly the lowest-priority unfinished VCL story, then stop. Reproduce first. No broad rule/AI or UI redesign.
3. Parent owns browser acceptance, pass flags, commits and immediate publication. CLI agents MUST NOT commit/push/update publication refs or mark passing. Report evidence and pending checks. Do not advance until parent validates and publishes the previous issue.
4. ALL debugging is silent. Never enable browser sound or restore sound=true. Mock audio and silent decoding are permitted. Preserve native events, real decisions and visibility permissions.
5. Node22/pnpm; changed JS syntax, focused meaningful regression, full tests/sgs suite and actual Vite output for TS changes. Production: node scripts/sgs/build.mjs. No fixture shipping.
6. VCL-01 retains bundling/Vue, disables core minify. Exercise actual emitted surrender callbacks using real StepParser; source-only checks are insufficient.
7. VCL-02 uses Vercel root -> /sgs.html only, dist-sgs, existing450 audio files, same-origin URLs and hashes. Keep /index.html?sgs=1. Static preview omits local filesystem APIs.
8. VCL-03 tests real toolbar handler: disabled precedes blocked; gesture retry must not toggle off. Preserve equipment silence, timeout and disposal. VCL-04 preserves OfflineAdapter while undoing three file-handle regressions.
9. VCL-05 records actual gameplay, never injected state/fake results. windowsHide on new children; only127.0.0.1:8083; never change user8081 or sandbox; no --unsafe; do not collect hidden state.
10. Existing GPL/source/art/audio attribution and archived MAT-07/UX-09/US-006 remain intact. Pending browser evidence keeps passes=false. Never emit COMPLETE while an active story is false.
