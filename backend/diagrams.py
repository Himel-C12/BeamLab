"""Engineering diagrams generated from solved beam equilibrium."""

from __future__ import annotations

from typing import Any


def build_diagrams(model: dict, result: dict, samples_per_segment: int = 12) -> dict:
    """Return SFD/BMD samples in kN and kN-m.

    The diagram is reconstructed from the solved support reactions and applied
    loads. Sampling boundaries include every support, load and internal hinge,
    so jumps and hinge-zero moments are represented explicitly.
    """
    supports = result["reactions"]
    loads = model.get("loads", [])
    total = sum(float(s["length"]) for s in model.get("spans", []))
    boundaries = {0.0, total}
    for s in supports:
        boundaries.add(float(s["position"]))
    for load in loads:
        boundaries.add(float(load["position"]))
        if str(load.get("type", "")).lower() in {"udl", "distributed", "uniform"}:
            boundaries.add(float(load["to"]))
    xs = sorted(boundaries)

    def shear_moment(x: float, include_point_at: bool = True) -> tuple[float, float]:
        V = 0.0
        M = 0.0
        for r in supports:
            p = float(r["position"])
            if p <= x + 1e-10:
                R = float(r.get("vertical_kN", 0.0))
                V += R
                M += R * (x - p)
        for load in loads:
            kind = str(load.get("type", "")).lower().replace(" ", "_")
            value = float(load.get("value", 0.0))
            p = float(load.get("position", 0.0))
            if kind in {"point", "point_load"} and p <= x + 1e-10:
                P = -value
                V += P
                M += P * (x - p)
            elif kind == "moment" and p <= x + 1e-10:
                M += value
            elif kind in {"udl", "distributed", "uniform"}:
                a = float(load["position"])
                b = float(load["to"])
                if x > a:
                    length = min(x, b) - a
                    if length > 0:
                        W = -value * length
                        c = a + length / 2.0
                        V += W
                        M += W * (x - c)
        return V, M

    samples: list[dict[str, Any]] = []
    for a, b in zip(xs, xs[1:]):
        for j in range(samples_per_segment):
            x = a + (b - a) * j / samples_per_segment
            V, M = shear_moment(x)
            samples.append({"x": x, "shear_kN": V, "moment_kNm": M})
        V, M = shear_moment(b)
        samples.append({"x": b, "shear_kN": V, "moment_kNm": M})

    # Add explicit right/left values around point loads for visible SFD jumps.
    jump_points = []
    for load in loads:
        if str(load.get("type", "")).lower().replace(" ", "_") in {"point", "point_load"}:
            p = float(load["position"])
            vl, ml = shear_moment(max(0.0, p - 1e-8))
            vr, mr = shear_moment(p)
            jump_points.extend([
                {"x": p, "shear_kN": vl, "moment_kNm": ml, "side": "left"},
                {"x": p, "shear_kN": vr, "moment_kNm": mr, "side": "right"},
            ])

    hinge_moments = [
        {"x": h["position"], "moment_kNm": 0.0}
        for h in result.get("hinge_checks", [])
    ]
    return {"samples": samples, "jumps": jump_points, "hinges": hinge_moments}
