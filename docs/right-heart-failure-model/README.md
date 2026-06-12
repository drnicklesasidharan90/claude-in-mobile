# Interactive Model of Right Heart Failure

A self-contained, single-file interactive teaching model of right ventricular (RV)
failure. Open [`index.html`](./index.html) in any modern browser — no build step,
no dependencies, no network access required.

## What it does

You manipulate the four determinants of RV performance and watch the consequences
propagate to forward output, filling pressures, and bedside signs in real time:

| Control | Physiology |
|---|---|
| **Preload / volume** | Sets mean systemic filling pressure (MSFP) — drives the venous-return curve |
| **RV afterload** | Pulmonary artery pressure / PVR. The thin-walled RV is exquisitely afterload-sensitive |
| **RV contractility** | Intrinsic inotropy (ischaemia, infarct, depressants lower it) |
| **Heart rate** | Scales the cardiac-function plateau |

### Outputs
- **Hemodynamics:** cardiac output, right-atrial pressure (≈ CVP ≈ JVP), JVP height, cardiac index.
- **Cardiac-function & venous-return plot:** the operating point is the intersection of the
  Frank–Starling RV curve and the Guyton venous-return curve, with a greyed normal reference.
- **Anatomical schematic:** the RV dilates, the great veins / liver engorge, and the
  peripheries change colour as the operating point moves.
- **Clinical signs** that light up as they would at the bedside: raised JVP, hepatojugular
  reflux, tender hepatomegaly, peripheral edema, ascites, fatigue/low output, cool peripheries.

### Preset scenarios
Normal · Pulmonary hypertension · Acute pulmonary embolism · RV infarction ·
Cor pulmonale (COPD) · Decompensated RHF · Hypovolemia.

## The model

Steady-state output is found where the RV function curve

```
CO(RAP) = P · (1 − e^(−(RAP+2)/3))
```

crosses the venous-return line

```
VR(RAP) = (MSFP − RAP) / R_vr
```

The plateau `P` rises with contractility and heart rate and falls steeply with afterload
(an RV-specific sensitivity). MSFP rises super-linearly with volume, mirroring the salt/water
retention that drives the dramatic venous congestion of chronic RV failure. The crossing point
gives right-atrial pressure and forward output, which map to the displayed signs.

> ⚠️ Numbers are illustrative for teaching, not for clinical use.
