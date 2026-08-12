# BeamLab

A clean rebuild of Beam Analyzer by Himel.

## Architecture

- `backend/` — Python + FastAPI structural-analysis service.
- `frontend/` — plain HTML/CSS/JavaScript interface with SVG beam visualization.
- `backend/tests/` — solver tests.

## Engineering rule

Internal hinges are structural releases, not external supports. They must never be rendered or solved as ordinary pin supports.

## Development

Run the backend from `backend/` with:

```bash
uvicorn main:app --reload
```

The production solver will be added only after the structural test cases are established.
