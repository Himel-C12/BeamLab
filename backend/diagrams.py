"""Reconstruct engineering diagrams from BeamLab's solved model."""

from __future__ import annotations

from typing import Any


def _kind(value: Any) -> str:
    return str(value).strip().lower().replace("-", "_").replace(" ", "_")


def _point_vertical(load: dict) -> float:
    import math
    return float(load.get("value", 0.0)) * math.cos(math.radians(float(load.get("angle", 0.0))))


def _udl_result(load: dict, x: float) -> tuple[float, float]:
    """Return downward-load shear and moment contribution at x."""
    a = float(load["position"])
    b = float(load["to"])
    q0 = float(load.get("value", 0.0))
    q1 = float(load.get("value2", load.get("value_2", q0)))
    if x <= a:
        return 0.0, 0.0
    L = b - a
    if x < b:
        l = x - a
        qx = q0 + (q1 - q0) * l / L
        W = (q0 + qx) * l / 2.0
        first = q0 * l * l / 2.0 + (q1 - q0) * l**3 / (3.0 * L)
        return -W, -(l * W - first)
    W = (q0 + q1) * L / 2.0
    first = q0 * L * L / 2.0 + (q1 - q0) * L * L / 3.0
    return -W, -(L * W - first)


def _beam_response(el: dict, x: float) -> tuple[float, float]:
    """Hermite interpolation of deflection (mm) and rotation (rad)."""
    x0, x1 = float(el["x0"]), float(el["x1"])
    L = x1 - x0
    if L <= 0:
        return float(el["v0_mm"]), float(el["theta0_rad"])
    z = min(1.0, max(0.0, (x - x0) / L))
    v0 = float(el["v0_mm"]) / 1000.0
    v1 = float(el["v1_mm"]) / 1000.0
    t0, t1 = float(el["theta0_rad"]), float(el["theta1_rad"])
    L2 = L
    n1 = 1 - 3*z*z + 2*z*z*z
    n2 = z - 2*z*z + z*z*z
    n3 = 3*z*z - 2*z*z*z
    n4 = -z*z + z*z*z
    v_m = n1*v0 + n2*L2*t0 + n3*v1 + n4*L2*t1
    dn1 = -6*z + 6*z*z
    dn2 = 1 - 4*z + 3*z*z
    dn3 = 6*z - 6*z*z
    dn4 = -2*z + 3*z*z
    theta = (dn1*v0 + dn2*L2*t0 + dn3*v1 + dn4*L2*t1) / L
    return v_m * 1000.0, theta


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

    def shear_moment(x: float) -> tuple[float, float]:
        V = 0.0
        M = 0.0
        for r in supports:
            p = float(r["position"])
            if p <= x + 1e-10:
                R = float(r.get("vertical_kN", 0.0))
                V += R
                M += R * (x - p)
        for load in loads:
            kind = _kind(load.get("type"))
            p = float(load.get("position", 0.0))
            if kind in {"point", "point_load"} and p <= x + 1e-10:
                P = -_point_vertical(load)
                V += P
                M += P * (x - p)
            elif kind == "moment" and p <= x + 1e-10:
                M += float(load.get("value", 0.0))
            elif kind in {"udl", "distributed", "uniform"}:
                dv, dm = _udl_result(load, x)
                V += dv
                M += dm
        return V, M

    elements = result.get("elements", [])
    samples: list[dict[str, Any]] = []
    for a, b in zip(xs, xs[1:]):
        for j in range(samples_per_segment):
            x = a + (b-a)*j/samples_per_segment
            V, M = shear_moment(x)
            el = next((e for e in elements if float(e["x0"])-1e-10 <= x <= float(e["x1"])+1e-10), None)
            d, rot = _beam_response(el, x) if el else (0.0, 0.0)
            samples.append({"x": x, "shear_kN": V, "moment_kNm": M, "deflection_mm": d, "rotation_rad": rot})
    if xs:
        x = xs[-1]
        V, M = shear_moment(x)
        el = next((e for e in reversed(elements) if float(e["x0"])-1e-10 <= x <= float(e["x1"])+1e-10), None)
        d, rot = _beam_response(el, x) if el else (0.0, 0.0)
        samples.append({"x": x, "shear_kN": V, "moment_kNm": M, "deflection_mm": d, "rotation_rad": rot})

    jumps = []
    for load in loads:
        if _kind(load.get("type")) in {"point", "point_load"}:
            p = float(load["position"])
            vl, ml = shear_moment(max(0.0, p-1e-8))
            vr, mr = shear_moment(p)
            jumps.extend([
                {"x": p, "shear_kN": vl, "moment_kNm": ml, "side": "left"},
                {"x": p, "shear_kN": vr, "moment_kNm": mr, "side": "right"},
            ])

    hinge_moments = [{"x": h["position"], "moment_kNm": 0.0} for h in result.get("hinge_checks", [])]
    return {"samples": samples, "jumps": jumps, "hinges": hinge_moments}
