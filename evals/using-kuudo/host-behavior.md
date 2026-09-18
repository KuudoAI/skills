# Host behavior evidence

Date: 2026-09-14

Claude Code was updated from `2.1.257` to `2.1.270` because plugin evaluations require `2.1.269` or later. Codex was tested with `codex-cli 0.154.0`. Claude evaluation reports were kept local with `--no-publish`.

| Client/version | Installation path | Prompt/event | Expected | Observed | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code 2.1.270 | Isolated plugin fixture | `claude plugin validate <fixture> --strict` | Plugin, hooks, and skills validate | Official validation passed | pass | Fixture intentionally omitted the marketplace file |
| Claude Code 2.1.270 | Repository root | `claude plugin validate . --strict` | Development marketplace validates | Official validation passed | pass | Root validation selected the marketplace manifest |
| Claude Code 2.1.270 | Plugin eval, with/without | Three natural routing prompts, three runs per arm | Correct leaf and literal selection announcement in every with-plugin run; control arm included | Correct leaf fired in 9/9 with-plugin runs; the announcement grader failed because Claude paraphrased the required format; control score was `0` | fail | Cost `$3.5383675`; evidence: `.tmp/claude-plugin-eval/results.json` |
| Claude Code 2.1.270 | Plugin eval diagnostic | Sponsored Products audit, one retained-trace run | Classify the announcement failure | Claude said “I'll use the Sponsored Products campaign auditor skill for this,” then invoked the exact leaf | pass | Confirmed an instruction-compliance defect rather than a routing defect; cost `$0.2276615` |
| Claude Code 2.1.270 | Plugin eval after focused fix | Sponsored Products audit | `amazon-ads-sp-campaign-auditor`, announced in the literal format | Both graders passed; score `1.0` | pass | One focused run; evidence: `.tmp/claude-plugin-green/results.json` |
| Claude Code 2.1.270 | Plugin eval after focused fix | Seller Central listing review | `amazon-sp-listing-optimizer`, announced in the literal format | Both graders passed; score `1.0` | pass | One focused run; evidence: `.tmp/claude-plugin-green/results.json` |
| Claude Code 2.1.270 | Plugin eval after focused fix | FBA profitability calculation | `amazon-profitability-calculator`, announced in the literal format | Both graders passed; score `1.0` | pass | One focused run; evidence: `.tmp/claude-plugin-green/results.json`; three-case focused cost `$0.779615` |
| Claude Code 2.1.270 | Live `--plugin-dir` session | `/clear`, then Sponsored Products audit | Bootstrap reinjected before leaf selection | Claude announced and loaded `kuudo-skills:amazon-ads-sp-campaign-auditor` after `/clear` | pass | Haiku lifecycle session cost `$0.1352` |
| Claude Code 2.1.270 | Hook registration and shell test | `compact` lifecycle event | Matcher and output path support reinjection | `startup\|clear\|compact` and full context injection passed automated tests | pass | Structural verification only |
| Claude Code 2.1.270 | Live `--plugin-dir` session | Real compaction | Bootstrap reinjected after actual compaction | Not exercised | not run | Cumulative Claude spend was `$4.680844`; another live compaction was not risked against the approved `$5` ceiling |
| Codex CLI 0.154.0 | Isolated marketplace, pinned URL source | Sponsored Products audit | Installed plugin exposes current working-tree skills | URL source cloned Git `HEAD`; the uncommitted `0.1.0` skill collection was absent and no Kuudo skill loaded | fail | This directly triggered the documented local-source fallback |
| Codex CLI 0.154.0 | Isolated marketplace, local source | Marketplace add, plugin add, and list | Enabled `kuudo-skills` version `0.1.0` | Installation and list passed; cached plugin contained `using-kuudo` and the leaf skills | pass | Normal Codex configuration was not modified |
| Codex CLI 0.154.0 | Isolated marketplace, local source | `Audit my Sponsored Products campaigns.` | `using-kuudo` before `amazon-ads-sp-campaign-auditor` | Trace loaded both files in that order and asked for report data | pass | Codex warned that some descriptions were shortened to fit the skills context budget, while every skill remained visible |
| Codex CLI 0.154.0 | Isolated marketplace, local source | `Review this Seller Central listing.` | `using-kuudo` before `amazon-sp-listing-optimizer` | Trace loaded both files in that order and asked for the ASIN/listing | pass | Same skills-context-budget warning |
| Codex CLI 0.154.0 | Isolated marketplace, local source | `Calculate whether this FBA product is profitable after Amazon fees.` | `using-kuudo` before `amazon-profitability-calculator` | Trace loaded the files sequentially in that order and requested profitability inputs | pass | Same skills-context-budget warning |
| skills CLI via `npx` | Repository root | `npx skills add . --list` | Discover every portable direct-child skill | Found 17 skills, including `using-kuudo` | pass | Third-party execution was explicitly approved; no skill installation was requested |

## Commands and cost

The initial automated command used `--ablation with-without --runs 3 --threshold 1.0 --max-cost-usd 5 --trust-plugin --no-publish`. After the trace showed a permitted paraphrase, `using-kuudo` was tightened to require the exact announcement format. The focused green command used `--ablation none --runs 1 --threshold 1.0 --max-cost-usd 1.1` across all three cases so total Claude spend remained below the approved ceiling.

Total observed Claude model cost was `$4.680844`; the `$5` ceiling was not reached. Codex reports token usage rather than a dollar cost in this CLI, so no Codex dollar amount is available.
