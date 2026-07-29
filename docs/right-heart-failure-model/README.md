# Interactive Model of Right Heart Failure

A self-contained, single-file interactive teaching model of right ventricular (RV)
failure. Open [`index.html`](./index.html) in any modern browser — no build step,
no dependencies, no network access required.

## What it does

You manipulate four hemodynamic inputs and watch the consequences propagate to
forward output and filling pressures in real time. A separate time-course selector
prevents chronic congestion findings from appearing automatically in acute scenarios.

| Control | Physiology |
|---|---|
| **Stressed volume / venous tone** | Relative input that sets mean systemic filling pressure (MSFP) and shifts the venous-return curve |
| **RV afterload index** | Relative input that depresses the RV function curve; it is explicitly not PASP or PVR |
| **RV contractility index** | Relative input for intrinsic inotropy |
| **Heart rate** | Schematic balance between rate-related output and loss of filling time at marked tachycardia |
| **Congestion time course** | Context modifier for edema and ascites only; it does not alter the hemodynamic solver |

### Outputs

- **Hemodynamics:** cardiac output, right-atrial pressure/CVP, estimated JVP height,
  and cardiac index using a stated assumed BSA of 1.9 m².
- **Cardiac-function & venous-return plot:** the operating point is the intersection of the
  Frank–Starling RV curve and the Guyton venous-return curve, with a greyed normal reference.
- **Anatomical schematic:** the RV dilates, the great veins / liver engorge, and the
  peripheries change colour as the operating point moves.
- **Possible bedside findings:** qualitative tendencies, not deterministic diagnoses.
  Persistent congestion is required before the model highlights edema or ascites.

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

The plateau `P` rises with contractility and with heart rate over a limited range,
falls at marked tachycardia, and falls with the afterload proxy. MSFP rises with the
normalized stressed-volume/venous-tone input. The crossing point gives right-atrial
pressure and forward output, which feed qualitative display rules.

The estimated JVP above the sternal angle uses the conventional bedside approximation:

```text
max(0, RAP × 1.36 cm H₂O/mmHg − 5 cm)
```

## Evidence status and limitations

- 🟡 **Accepted physiology:** at steady state, venous return equals cardiac output;
  Guyton analysis relates venous return to MSFP, RAP, and resistance to venous return.
- 🟡 **Accepted clinical teaching:** the RV is highly sensitive to acute afterload
  increases, and persistent systemic venous congestion can produce edema and ascites.
- 🔴 **Model-specific / not validated:** every constant, curve shape, preset, color
  band, and bedside-finding threshold in this page is hand-tuned for demonstration.
- 🔴 **Deliberately omitted:** pulmonary compliance and wave reflection, ventricular
  interdependence, LV disease, tricuspid or pulmonic valve disease, pericardial
  constraint, respiration/PEEP, renal-neurohormonal feedback, rhythm and AV synchrony,
  body-size variation, treatment effects, and transient dynamics.
- ⚫ **Do not infer patient data:** the displayed values cannot estimate a real
  patient's pressures, output, volume responsiveness, diagnosis, prognosis, or therapy.

## Sources

- Konstam MA, et al. *Evaluation and Management of Right-Sided Heart Failure:
  A Scientific Statement From the American Heart Association.* Circulation. 2018.
  [PubMed](https://pubmed.ncbi.nlm.nih.gov/29650544/)
- Arrigo M, et al. *Diagnosis and treatment of right ventricular failure secondary
  to acutely increased right ventricular afterload (acute cor pulmonale): a clinical
  consensus statement of the Association for Acute CardioVascular Care of the ESC.*
  Eur Heart J Acute Cardiovasc Care. 2024.
  [ESC summary](https://esc365.escardio.org/journal/82751)
- Persichini R, et al. *Venous return and mean systemic filling pressure: physiology
  and clinical applications.* Critical Care. 2022.
  [Full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC9128096/)
- Applefeld MM. *The Jugular Venous Pressure and Pulse Contour.* Clinical Methods:
  The History, Physical, and Laboratory Examinations. 3rd ed.
  [NCBI Bookshelf](https://www.ncbi.nlm.nih.gov/books/NBK300/)

> ⚠️ Conceptual teaching model only. Not validated, patient-specific, diagnostic,
> prognostic, or suitable for monitoring or treatment decisions.
