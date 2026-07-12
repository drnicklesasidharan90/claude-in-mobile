# July 2026 duty roster + USMLE planner

Personal planning folder — not part of the `claude-in-mobile` product. Nothing
here is imported by `src/`, built by `tsc`, or run in CI.

## Files

| File | What it is |
|---|---|
| `july-2026-roster.csv` | The duty roster. **Edit this** — one row per day, fill the `shift` column. |
| `generate-plan.mjs` | Merges the roster with shift-aware study prescriptions. |
| `july-2026-integrated-plan.md` | Generated day-by-day schedule. Don't edit by hand. |
| `july-2026-usmle-plan.md` | The strategy: templates per shift type, system rotation, assessment cadence. |

## Usage

1. Open `july-2026-roster.csv` and replace `TBD` with the real shift for each
   day. Codes: `D` day duty · `E` evening duty · `N` night duty · `OFF` off
   day · `L` leave. Free-text notes go in the last column.
2. Regenerate the integrated schedule:

   ```bash
   node planner/generate-plan.mjs --write
   ```

3. Read `july-2026-integrated-plan.md` — each day shows the shift, the realistic
   study budget, and exactly what to do. Days after a night shift are
   automatically converted to recovery days.

Re-run step 2 whenever the roster changes (swapped shifts, extra nights).
