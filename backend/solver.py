"""Clean starting point for BeamLab's structural solver.

The solver is intentionally kept separate from the web layer. Internal hinges
will be implemented as rotational releases in the analysis model, not as
ordinary supports.
"""

from dataclasses import dataclass

@dataclass(frozen=True)
class InternalHinge:
    position: float


def solve_beam(model: dict) -> dict:
    """Placeholder for the verified beam solver.

    The first milestone creates a stable project structure before adding
    structural calculations. No engineering result is fabricated here.
    """
    raise NotImplementedError("Beam solver is not implemented yet.")
