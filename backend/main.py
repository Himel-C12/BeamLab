from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from diagrams import build_diagrams
from solver import solve_beam

app = FastAPI(title="BeamLab API", version="0.2.0")


class Health(BaseModel):
    status: str


@app.get("/api/health", response_model=Health)
def health() -> Health:
    return Health(status="ok")


@app.post("/api/analyze")
def analyze(model: dict):
    try:
        result = solve_beam(model)
        result["diagrams"] = build_diagrams(model, result)
        return result
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/")
def root():
    return {"name": "BeamLab", "version": "0.2.0"}
