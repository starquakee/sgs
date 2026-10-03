# Ralph iteration: SGS decade single-player

1. Read root AGENTS.md, tasks/prd-sgs-decade.md, prd.json and progress.txt.
2. Work only on the lowest-priority unfinished story. This run uses ralph/sgs-decade.
3. Inspect upstream code before adapting it; preserve LICENSE and all attribution. No network gameplay or publishing.
4. Implement exactly ONE story per run. Do not change other stories or opportunistically refactor upstream.
5. Run narrow meaningful validation. Mandatory for new JS: node --check. For catalog: node scripts/sgs/build-catalog.mjs and node --test tests/sgs/*.test.mjs.
6. UI stories require a real browser check. If browser is unavailable, record pending validation; do not mark passes true.
7. Update prd.json and append evidence/gotchas to progress.txt. Do not mark sourced skills behavior-verified.
8. Commit validated changes locally with feat: US-XXX - title. NEVER PUSH: origin belongs to the third-party upstream, not the user.
9. When and only when EVERY story passes with evidence, output the completion token specified by the Ralph runner on its own line.

The parent agent supervises and may handle runtime setup and browser validation. Avoid redoing its work; check progress first. A blocker must be recorded honestly, not hidden by changing acceptance criteria.
