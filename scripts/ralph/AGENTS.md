# Ralph iteration: SGS Quality Audit

1. Read root `AGENTS.md`, `tasks/prd-sgs-quality-audit.md`, `prd.json` and `progress.txt`. Branch: `codex/sgs-quality-audit`.
2. Implement ONLY the lowest-priority unfinished `OPT-*` story, then stop. Reproduce first. Keep changes scoped to SGS adapter, launcher, build/verification scripts and tests.
3. All debugging is strictly muted (`sound: false`). Never enable sound or inject fake game state / synthetic `visibilityState`.
4. Always run Node 22 (`/mnt/c/Program Files/nodejs/node.exe` or `node` >= 22) with `< /dev/null` in WSL:
   - `"$NODE22" --check <modified-js-files> < /dev/null`
   - `"$NODE22" --test tests/sgs/<focused>.test.mjs < /dev/null`
   - `"$NODE22" --test --test-reporter=dot tests/sgs/*.test.mjs < /dev/null`
   - `"$NODE22" scripts/sgs/build.mjs < /dev/null`
   - `"$NODE22" scripts/sgs/verify-deployment.mjs < /dev/null`
5. UI stories require muted browser acceptance (`127.0.0.1:8083`, `static-only`, never `8081`) across desktop (`1280x720`, `1024x640`) and relevant narrow viewports (`390x844` / `540x800` / `640x720` / `860x640`).
6. Commit each completed story cleanly, generate bounded snapshot (`scripts/sgs/create-github-snapshot.mjs`), check `git merge-base --is-ancestor sgs/main publish/sgs`, push ONLY `git push sgs publish/sgs:main`, verify remote SHA and live deployment before starting the next story.
7. Preserve `LICENSE`, upstream rules/AI, portraits, audio assets, lockfiles, and archived incomplete statuses (`VCL-05`, `MAT-07`, `UX-09`, `US-006`).
8. Only emit `<promise>COMPLETE</promise>` on its own line after ALL stories in `prd.json` have `passes: true` AND `scripts/ralph/final-validation.sh` exits 0.
