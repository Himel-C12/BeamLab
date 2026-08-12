from fastapi import FastAPI
from pydantic import BaseModel
from typing import Literal

app = FastAPI(title="BeamLab API", version="0.1.0")

class Health(BaseModel):
    status: str

@app.get("/api/health", response_model=Health)
def health() -> Health:
    return Health(status="ok")

@app.get("/")
def root():
    return {"name": "BeamLab", "version": "0.1.0"}
