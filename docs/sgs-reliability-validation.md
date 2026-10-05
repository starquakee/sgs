# SGS reliability validation

Baseline: 2d7477f, Node22.12.0, 173/173 existing tests pass (2026-10-05).
Accepted plan: tasks/prd-sgs-reliability.md. Each story requires parent browser evidence before passing.
Prior UX-09 real-background check remains pending in archive/2026-10-05-sgs-client-experience; archived US-006 remains incomplete.

## Audit
- Actual production lobby click on xianding:shen_huangzhong drops document.activeElement to BODY.
- Common browsing786 includes60 characters/63 distinct initial skills with null description. Each missing translation is a template;100 poptip calls plus one fixed-array map/join. No missing skill implementation inferred.
- Existing audio with first fetch permanently pending and second resolving leaves2pending/0started. This is a deterministic adapter fault test, not a real match.

## MAT-01
MAT-01: static description reader covers63 audited skills/60characters (64 references), preserves catalog evidence and fingerprints, handles exact-ID cross-pack/inline/rule/card/map references and bounded cycles.7focused and180total tests pass; syntax/diff pass. Raw production roster SHA matches. Parent production8083 lobby loaded2563/494filtered, existing selection/ratings/launch intact; screenshot inspected1280x720 and console empty. Explanation UI remains MAT-02.

## 2026-10-05 - MAT-02
MAT-02: sourced initial rules/expandable skill-card-rule-character references, semantic paragraphs/lists, pinned source links and large reading dialog.3new tests;183total pass; JS syntax/CSS parse pass. Parent production8083 ShenHuangZhong confirms four injury options and Tianchong; found/fixed dialog action scrolling offscreen. Actual1024x640 dialog700x608/return126x50bottom599;390x844 dialog341x812/returnbottom803/document375wide. Escape collapses nearest term, then dialog close restores read-skills focus and unchanged ShenHuangZhong. Console empty; two durable screenshots. No upstream/native-rule edits.

## 2026-10-05 - MAT-03
MAT-03: keyed card/filter reconciliation retains nodes and images on selection; resize keeps focused visible key on its correct page; filter removal chooses adjacent chip then search. IME uses committed query only.5new tests,188total pass and JS/diff checks pass. Parent production mouseclick and Enter retain BUTTON xianding:shen_huangzhong;1024resize retains same focus. Removing search focuses age, removing final age focuses search; selected hero/mode unchanged. Sorting both ways and pagination work; restored age=true/high sorting; console empty. Screenshot lobby-keyboard-selection.jpg. Composition lifecycle is covered by actual lobby handlers in unit harness; no claim of OS IME automation.

## 2026-10-05 - MAT-04
MAT-04: deadline-aware loader bounds fetch/body/decode to8000ms, aborts/cancels pending jobs, retains successful cache only, guards late results/new retries, disposes buffers. Native TimeoutError skips whole utterance instead of tryAudio variant retries.6new tests;194total pass, syntax/diff pass. Parent real production1024x640 WeiDongZhuo landlord: selected Hanbing hasplayed0, native confirm playscard10.152..11.147 and Guangyong10.661..15.890 on same unlocked context;7HP/8max, hand7, native play returns normally. Console empty; screenshot audio-native-use.jpg; paused test match. No listening claim. Assets/rules/timing/dedup and audio channel gains unchanged.

## 2026-10-05 - MAT-05
MAT-05: bounded in-memory versioned JSON reports, safe error summaries, allowlisted build/mode/general/action and native publicLog only; manual Blob download with cleanup and recoverable errors.5new tests;199total pass; JS/CSS/diff pass. Parent production1024/390 found native #system pointer-events:none made visible new button click through; fixed explicit pointer events and isolated input. Download API event timed out but actual851-byte JSON was created in Downloads/sgs-problem-2026-10-05T06-27-34-301Z.json; inspected schema1, correct upstream/mode/hero,5native public lines/no hidden game objects. Real wine selection1card/1target stays through report open/close; clock00:20 unchanged, focus returns SUMMARY.390 dialog356x319 and both>=126x50 actions fit. Desktop/mobile screenshots; console empty. Native technical game.print output is separate from ui.sidebar and is not collected.

## 2026-10-05 - MAT-06
MAT-06: SGS arena-only script/rejection handlers replace native technical alerts, deduplicate bounded errors, acquire independent fatal lease before closing owned modals, keep browser console evidence and restore handlers on disposal. Fault modal cannot Escape/cancel into unsafe continuation; report/restart/return and navigation retry available. Session background/manual/auto guards respect fatal state.7new tests,206total pass; real native PauseManager gate test preserves event/cards/targets and does not release on native resume/background return. Parent isolated browser fixture (not a match) verifies duplicate1record/1modal, Promise error, nondismissal, nested report failure+retry, both navigation callbacks and preexisting pause retained;1280/390 screenshots. Test-only fixture deliberately emits console errors; no live game state injection. Standalone HTML/mjs under tests only, temporary dist copy removed by final build.

## MAT-07: completed checks, real background still pending
- Final Node22/pnpm production build succeeded. Initial sandboxed pnpm lstat EPERM resolved by scoped tool escalation, no sandbox disabled. Temporary fault fixtures are absent from dist-sgs after the build.
- Production long-match start: 2026-10-05 ~06:42UTC, WeiDongZhuo as human lord in native8identity. Opening started; native Hualiu equip plus Guangyong resolve. Long test includes human decisions and UI checks, not a claim of30minutes uninterrupted auto play.
- Edge extension reconnection failed; real document.hidden transition remains pending.
- Separate eight-player long match reached native active clock30:19 in round3, with49cards remaining in the deck and an ordinary human play prompt. It stayed on the same page since approximately06:42UTC, including human decision waits and UI checks; not30minutes of uninterrupted autoplay. Real play included equipment, Wuzhong, skill resolution, Nanman/Arrows responses, one/two-card discards, AI turns, death and public identity reveal. Warning/error console capture remained empty. [30-minute table](sgs-reliability-screenshots/final-long-match-30min.jpg).
- Native autoplay was enabled after that observation; the same long match completed with victory at33:16, round8 (6damage,2received,49cards gained,25cards used,3kills). Final warning/error console remained empty. Exactly one result row was added, bringing local records to12rows:10matches from this run plus2preexisting records. [Long match result](sgs-reliability-screenshots/final-long-match-result.jpg).

### Completed native matches and repeated operations

Production build at `http://127.0.0.1:8083/`; native rules/AI and ordinary UI inputs only. No injected cards, event state, identities, result values or clocks. Matches below used xianding:v_dongzhuo; this is representative integration evidence, not general/skill completeness evidence.

| Match | Native result | Rounds | Active clock | Evidence |
| --- | --- | --- | --- | --- |
| Doudizhu landlord | Victory | 5 | 01:12 | [Result](sgs-reliability-screenshots/final-landlord-result.jpg) |
| Doudizhu farmer | Victory | 1 | 00:32 | [Result](sgs-reliability-screenshots/final-farmer-result.jpg) |
| Native 2v2, human seat 4 | Victory | 4 | 01:32 | [Opening](sgs-reliability-screenshots/final-2v2-opening.jpg), [result](sgs-reliability-screenshots/final-2v2-result.jpg) |
| Eight-player identity, human lord | Victory | 3 | 03:28 | [Result](sgs-reliability-screenshots/final-identity-result.jpg) |

- Farmer opening displayed ally ChenDao's four cards. 2v2 opening displayed human seat4/five cards and ally BaoSanNiang seat1/four cards, with seats2/3 marked enemies.
- Five successive landlord rematches from the result button all completed: 4 rounds/01:17, 4/00:54, 1/00:22, 2/00:35, 3/02:05. Same selected edition, landlord role, speed and sound preferences; randomized opponents/opening cards; one HUD, one action rail and one report button per page. [Fifth result](sgs-reliability-screenshots/final-five-replays.jpg).
- Before the long match ended, lobby records showed each of the nine completed matches exactly once alongside the two preexisting records, with no premature outcome for the long match. [Records at that point](sgs-reliability-screenshots/final-battle-records.jpg).
- Restored initial lobby selection/configuration: ShenHuangZhong, landlord, normal speed, hide-old enabled, overall score descending, sound/three gains enabled at100%. Returned before turn one without increasing the11existing result rows. [Final skill reading](sgs-reliability-screenshots/final-skill-reading.jpg) shows all four injury terms and Tianchong in the restored selection.
- Twenty completed settings/record/help open-close cycles on the separate eight-player table retained the selected Wuzhong card and human target (1 card/1 target), zero remaining owned dialogs, and the same 1505 DOM nodes after every close. No cumulative visible UI residue; this is not a heap profiler claim. [After cycle20](sgs-reliability-screenshots/final-modal-cycles.jpg).
- Warning/error console capture was empty for the normal match pages. Expected errors from the isolated fault fixture are documented separately under MAT-06.

### Final viewport checks

Measured actual CSS viewport dimensions, not requested window dimensions. Card/target selection remained 1/1 while resizing the eight-player table; native confirm remained126×50px at each size.

| CSS viewport | Confirm bottom | Evidence |
| --- | --- | --- |
| 1024×640 | 468px | [Table](sgs-reliability-screenshots/final-table-1024.jpg) |
| 1280×720 | 530px | [Table](sgs-reliability-screenshots/final-table-1280.jpg) |
| 1366×768 | 578px | [Table](sgs-reliability-screenshots/final-table-1366.jpg) |
| 1920×1080 | 850.4px | [Table](sgs-reliability-screenshots/final-table-1920.jpg) |

390px checks cover the [lobby](sgs-reliability-screenshots/final-lobby-mobile.jpg), [settings](sgs-reliability-screenshots/final-settings-mobile.jpg), skill reading, report and fault dialogs (MAT-02/05/06 evidence). The four desktop sizes are the supported table acceptance targets.

Ordinary `/index.html` without SGS launch parameters still presents native mode selection, with zero SGS HUD/report/owned-dialog nodes and an empty warning/error console. [Ordinary entry](sgs-reliability-screenshots/final-upstream-entry.jpg).

### Build and scope checks

- 206/206 Node tests passed after all code changes; all34 adapter JS modules passed syntax checks and all12 adapter CSS files parsed.
- Final Node22.12.0/pnpm10.11.0 production build succeeded; SHA256 of47 adapter output resources (34JS,12CSS,roster) matched the source inputs. Build provenance: aa58ce6 before documentation-only acceptance commit.
- Test-only fault fixture is absent from the production build. Native engine, character/card source and LICENSE have no diff against baseline2d7477f.
- No publish/push or service exposure was performed. Existing user service8081 was left untouched.

### Real background acceptance still required

The Edge browser connection could not be established. The in-app browser remained `document.hidden=false` across available surface changes, so it cannot supply genuine background evidence. Synthetic visibility events would not satisfy this check and were not used as acceptance evidence.

On a connected ordinary browser, start a real match, select a legal card/target, switch away for at least5seconds, and return: selection and game clock must remain preserved, and only explicit Continue may advance the game. Repeat while settings/reference/manual pause already owns a lease, and with background-pause preference disabled. MAT-07 and archived UX-09 must stay false until these observations are recorded; archived US-006 remains false independently.
