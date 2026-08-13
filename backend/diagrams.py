"""Reconstruct engineering diagrams from BeamLab's solved model."""

from __future__ import annotations

from typing import Any


def _kind(value: Any) -> str:
    return str(value).strip().lower().replace("-", "_").replace(" ", "_")


def _point_vertical(load: dict) -> float:
    import math
    return float(load.get("value", 0.0)) * math.cos(math.radians(float(load.get("angle", 0.0))))


def _udl_result(load: dict, x: float) -> tuple[float, float]:
    """Return shear and bending-moment contribution of a UDL at cut x.

    Integrate the load about the actual global cut position. This matters
    especially when the frontend has split one UDL into several small loaded
    elements: each segment must contribute its moment about x, not about its
    own right-hand end.
    """
    a, b = float(load["position"]), float(load["to"])
    q0 = float(load.get("value", 0.0))
    q1 = float(load.get("value2", load.get("value_2", q0)))
    if x <= a:
        return 0.0, 0.0
    L = b - a
    if L <= 0.0:
        return 0.0, 0.0
    l = min(x, b) - a
    k = (q1 - q0) / L
    W = q0 * l + 0.5 * k * l * l
    first = 0.5 * q0 * l * l + (k * l**3) / 3.0
    return -W, first - W * (x - a)


def _beam_response(el: dict, x: float) -> tuple[float, float]:
    x0, x1 = float(el["x0"]), float(el["x1"])
    L = x1 - x0
    if L <= 0:
        return float(el["v0_mm"]), float(el["theta0_rad"])
    z = min(1.0, max(0.0, (x - x0) / L))
    v0 = float(el["v0_mm"]) / 1000
    v1 = float(el["v1_mm"]) / 1000
    t0 = float(el["theta0_rad"])
    t1 = float(el["theta1_rad"])
    n1 = 1 - 3 * z * z + 2 * z**3
    n2 = z - 2 * z * z + z**3
    n3 = 3 * z * z - 2 * z**3
    n4 = -z * z + z**3
    v = (n1 * v0 + n2 * L * t0 + n3 * v1 + n4 * L * t1) * 1000
    theta = ((-6 * z + 6 * z * z) * v0 + (1 - 4 * z + 3 * z * z) * L * t0 + (6 * z - 6 * z * z) * v1 + (-2 * z + 3 * z * z) * L * t1) / L
    return v, theta


def build_diagrams(model: dict, result: dict, samples_per_segment: int = 16) -> dict:
    supports = result.get("reactions", [])
    loads = model.get("loads", [])
    total = sum(float(s["length"]) for s in model.get("spans", []))
    boundaries = {0.0, total}
    for s in supports:
        boundaries.add(float(s["position"]))
    for load in loads:
        boundaries.add(float(load["position"]))
        if _kind(load.get("type")) in {"udl", "distributed", "uniform"}:
            boundaries.add(float(load["to"]))
    xs = sorted(boundaries)

    def shear_moment(x):
        V = M = 0.0
        for r in supports:
            p = float(r["position"])
            if p <= x + 1e-10:
                R = float(r.get("vertical_kN", 0.0))
                V += R
                M -= float(r.get("moment_kNm", 0.0))
                M += R * (x - p)
        for load in loads:
            t = _kind(load.get("type"))
            p = float(load.get("position", 0.0))
            if t in {"point", "point_load"} and p <= x + 1e-10:
                P = -_point_vertical(load)
                V += P
                M += P * (x - p)
            elif t == "moment" and p <= x + 1e-10:
                M -= float(load.get("value", 0.0))
            elif t in {"udl", "distributed", "uniform"}:
                dv, dm = _udl_result(load, x)
                V += dv
                M += dm
        return V, M

    elements = result.get("elements", [])
    if not elements:
        nodes = result.get("nodes", [])
        for a, b in zip(nodes, nodes[1:]):
            elements.append({"x0": a["x"], "x1": b["x"], "v0_mm": a["deflection_mm"], "v1_mm": b["deflection_mm"], "theta0_rad": a.get("rotation_rad_right") or 0.0, "theta1_rad": b.get("rotation_rad_left") or 0.0})

    samples = []
    for a, b in zip(xs, xs[1:]):
        for j in range(samples_per_segment):
            x = a + (b - a) * j / samples_per_segment
            V, M = shear_moment(x)
            el = next((e for e in elements if float(e["x0"]) - 1e-10 <= x <= float(e["x1"]) + 1e-10), None)
            d, rot = _beam_response(el, x) if el else (0.0, 0.0)
            samples.append({"x": x, "shear_kN": V, "moment_kNm": M, "deflection_mm": d, "rotation_rad": rot})
    if xs:
        x = xs[-1]
        V, M = shear_moment(x)
        el = next((e for e in reversed(elements) if float(e["x0"]) - 1e-10 <= x <= float(e["x1"]) + 1e-10), None)
        d, rot = _beam_response(el, x) if el else (0.0, 0.0)
        samples.append({"x": x, "shear_kN": V, "moment_kNm": M, "deflection_mm": d, "rotation_rad": rot})

    jump_positions = {float(r["position"]) for r in supports if _kind(r.get("type")) != "internal_hinge"}
    jump_positions.update(float(load["position"]) for load in loads if _kind(load.get("type")) in {"point", "point_load"})
    jumps = []
    for p in sorted(jump_positions):
        vl, ml = shear_moment(max(0.0, p - 1e-8))
        vr, mr = shear_moment(p)
        jumps += [{"x": p, "shear_kN": vl, "moment_kNm": ml, "side": "left"}, {"x": p, "shear_kN": vr, "moment_kNm": mr, "side": "right"}]

    hinges = [{"x": h["position"], "moment_kNm": 0.0} for h in result.get("hinge_checks", [])]
    return {"samples": samples, "jumps": jumps, "hinges": hinges}
