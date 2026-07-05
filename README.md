# Jelly Panic / 지켜줘! 젤리 패닉

Playable demo: https://ljhljh0703-cmd.github.io/jelly-panic/

`Jelly Panic` is a zero-dependency, single-file browser demo for a telegraphed placement puzzle defense game. Every threat is previewed before it fires, so the core challenge is reading the board rather than reacting quickly.

## What It Shows

- Pure vanilla JavaScript, no external runtime dependencies.
- Deterministic game logic shared by browser and Node tests.
- A release `index.html` for GitHub Pages.
- A public verification suite that checks logic, UI smoke behavior, and fairness simulation.

## Verification

Run from the repository root:

```sh
node test/test.js
node test/smoke.js
node test/sim.js 200
```

Current local gate before publish:

- `node test/test.js`: 90 passed, 0 failed.
- `node test/smoke.js`: 16 passed, 0 failed.
- `node test/sim.js 200`: unavoidable unfair spawns 0.00%.
- Counterfactual legacy pool risk: 19.1% of candidate cells would have been uncoverable without the coverability rule.

## Structure

```text
.
├── index.html
├── src/
│   ├── core.js
│   └── ui.js
└── test/
    ├── test.js
    ├── smoke.js
    └── sim.js
```

The test directory also contains symlinks to `src/core.js` and `src/ui.js` so the original test files can run unchanged.
