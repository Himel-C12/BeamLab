# BeamLab

A clean rebuild of Beam Analyzer by Himel, with the structural engine written in Python.

## Structure

- `backend/solver.py` — Euler-Bernoulli direct-stiffness solver.
- `backend/diagrams.py` — SFD/BMD reconstruction from solved equilibrium.
- `backend/main.py` — optional FastAPI API for local/server use.
- `backend/tests/` — regression tests for reactions, internal hinges and stability.
- `frontend/` — plain HTML/CSS/JavaScript + SVG interface.
- `.github/workflows/test.yml` — solver CI.
- `.github/workflows/pages.yml` — static deployment package.

## Python in the browser

The GitHub Pages build runs the same Python solver with Pyodide. The page loads
`backend/solver.py` and `backend/diagrams.py` into the browser, so the deployed
calculator does not depend on a separate application server.

## Engineering rules

- Internal hinges are **true rotational releases**, not pin supports.
- Vertical displacement is continuous through an internal hinge.
- Rotation is independent on the two sides of an internal hinge.
- Bending moment at an internal hinge is explicitly checked to be zero.
- Unstable or insufficiently restrained models are rejected instead of producing fabricated results.
- SFD and BMD are reconstructed from the solved reactions and applied loads.

## Local development

Backend:

```bash
cd backend
pip install -r requirements.txt
PYTHONPATH=. pytest -q
uvicorn main:app --reload
```

Frontend can be served from the repository with any static HTTP server. For
example:

```bash
python -m http.server 8000
```

Then open the appropriate frontend path in the browser.
