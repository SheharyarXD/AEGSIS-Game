# Phase 9 live verification complete - 19 October 2026

The user reauthorized live testing. Remaining checks have now completed.

- Main Vite server: port 5192; exec session 5422. Production preview: port 5194; exec session 50443.
- 62/62 offline tests, typecheck/build and preservation audit pass.
- Full browser regression: 46 passed, 0 failed/skipped/flaky.
- All six fresh actual-input acceptance captures pass, including corrected real-grounded-roof placement and enabled-capsule normal traversal. Rejected occluded/fallen roof capture is preserved with its explanation.
- Fifteen-scene LOW/MEDIUM/HIGH/ULTRA matrix completed. Real internal resolution: LOW1088x612, others1280x720 on DPR1 display.
- MEDIUM: Y78.3 FPS, demolition75.8, concurrent collapse/Y83.2; worst heavy frames <=62.6 ms. Cold-flight outliers104.2msMEDIUM/111.2msULTRA remain: no zero-stutter claim.
- Separate overlap recording passes and contains actual breach impacts while source bands fall. Still frame extracted and visually inspected at `live-2026-10-19/overlap-concurrent-frame.png`.
- Production smoke passes all four tiers and actual MEDIUM stationaryY; all assets/worker requests valid, no /src imports, no browser errors.
- Report filesystem checks: no missing links. Actual report browser decodes55images, plays49s overlap video and seeks concurrent-impact frame (metadata in review-browser.json).
- No application runtime source changed during this resumed pass; 12 protected source files and15 supplied originals still hash-match.
- New live report: artifacts/phase9/review.html. Handoff: docs/PHASE9-CODEX-TO-CLAUDE-HANDOFF.md. Detailed results: docs/PHASE9-LIVE-VERIFICATION.md.

Normal visible isolated MEDIUM game is open on5192, without QA hooks or page errors. Helper PID31436; evidence in live-2026-10-19/normal-game.json. Main Vite5192 and preview5194 remain running. Never close unrelated apps. No commits/deployments.
