"""BeamLab's tested Euler-Bernoulli direct-stiffness beam solver."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

TOL = 1e-9


@dataclass(frozen=True)
class InternalHinge:
    position: float


def _kind(value: Any) -> str:
    return str(value).strip().lower().replace("-", "_").replace(" ", "_")


def _num(value: Any, name: str) -> float:
    try:
        x = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be numeric") from exc
    if not np.isfinite(x):
        raise ValueError(f"{name} must be finite")
    return x


def _nodes(values: list[float]) -> list[float]:
    out: list[float] = []
    for x in sorted(values):
        if not out or abs(x - out[-1]) > TOL:
            out.append(x)
    return out


def _node_index(nodes: list[float], x: float) -> int:
    for i, p in enumerate(nodes):
        if abs(x - p) <= TOL:
            return i
    raise ValueError(f"Position {x:g} is not an analysis node")


def _k(EI: float, L: float) -> np.ndarray:
    L2, L3 = L * L, L * L * L
    return EI / L3 * np.array([
        [12, 6 * L, -12, 6 * L],
        [6 * L, 4 * L2, -6 * L, 2 * L2],
        [-12, -6 * L, 12, -6 * L],
        [6 * L, 2 * L2, -6 * L, 4 * L2],
    ], dtype=float)


def _linear_udl(q0: float, q1: float, L: float) -> np.ndarray:
    """Consistent nodal load vector for a linearly varying downward load.

    q0 and q1 are the load intensities at the left and right ends of the
    element. Vertical displacement is positive upward and rotation follows
    the beam DOF convention used by the stiffness matrix.
    """
    return 1000.0 * np.array([
        -L * (7.0 * q0 + 3.0 * q1) / 20.0,
        -L * L * (3.0 * q0 + 2.0 * q1) / 60.0,
        -L * (3.0 * q0 + 7.0 * q1) / 20.0,
        L * L * (2.0 * q0 + 3.0 * q1) / 60.0,
    ], dtype=float)


def _udl(q: float, L: float) -> np.ndarray:
    return _linear_udl(q, q, L)


def solve_beam(model: dict) -> dict:
    """Solve a beam using Euler-Bernoulli direct stiffness.

    Input units: length m, E GPa, I mm^4, force kN, moment kN-m.
    Output units: force kN, moment kN-m, deflection mm, rotation rad.
    """
    spans = model.get("spans") or []
    supports = model.get("supports") or []
    loads = model.get("loads") or []
    if not spans:
        raise ValueError("At least one span is required")

    sections = []
    total = 0.0
    for i, s in enumerate(spans, 1):
        L = _num(s.get("length"), f"span {i} length")
        E = _num(s.get("E", 200), f"span {i} E")
        I = _num(s.get("I", 1e8), f"span {i} I")
        if L <= 0 or E <= 0 or I <= 0:
            raise ValueError(f"span {i}: length, E and I must be positive")
        sections.append((total, total + L, E * 1e9, I * 1e-12))
        total += L

    def xpos(value: Any, name: str) -> float:
        x = _num(value, name)
        if x < -TOL or x > total + TOL:
            raise ValueError(f"{name}={x:g} is outside the beam")
        return min(total, max(0.0, x))

    positions = [0.0, total]
    hinge_positions = []
    for i, s in enumerate(supports, 1):
        x = xpos(s.get("position"), f"support {i} position")
        positions.append(x)
        if _kind(s.get("type")) in {"internal_hinge", "internalhinge", "hinge"}:
            hinge_positions.append(x)

    for i, load in enumerate(loads, 1):
        t = _kind(load.get("type"))
        if t in {"point", "point_load", "moment"}:
            positions.append(xpos(load.get("position"), f"load {i} position"))
        elif t in {"udl", "distributed", "uniform"}:
            a = xpos(load.get("position"), f"load {i} start")
            b = xpos(load.get("to"), f"load {i} end")
            if b <= a + TOL:
                raise ValueError(f"UDL {i}: end must be greater than start")
            positions += [a, b]
        else:
            raise ValueError(f"Unsupported load type: {load.get('type')}")

    nodes = _nodes(positions)
    hinges = {_node_index(nodes, x) for x in hinge_positions}
    if any(n in {0, len(nodes) - 1} for n in hinges):
        raise ValueError("An internal hinge must lie inside the beam, not at an end")

    v_dof = list(range(len(nodes)))
    next_dof = len(nodes)
    shared_rot: dict[int, int] = {}
    elements: list[dict[str, Any]] = []

    def rotation(node: int) -> int:
        nonlocal next_dof
        if node not in hinges:
            if node not in shared_rot:
                shared_rot[node] = next_dof
                next_dof += 1
            return shared_rot[node]
        r = next_dof
        next_dof += 1
        return r

    for e in range(len(nodes) - 1):
        a, b = nodes[e], nodes[e + 1]
        mid = (a + b) / 2
        section = next((s for s in sections if s[0] - TOL <= mid <= s[1] + TOL), None)
        if section is None:
            raise ValueError("Could not assign section properties to an element")
        _, _, E, I = section
        elements.append({
            "i": e,
            "j": e + 1,
            "E": E,
            "I": I,
            "dofs": [v_dof[e], rotation(e), v_dof[e + 1], rotation(e + 1)],
            "length": b - a,
        })

    ndof = next_dof
    K = np.zeros((ndof, ndof), dtype=float)
    F = np.zeros(ndof, dtype=float)

    for el in elements:
        el["k"] = _k(el["E"] * el["I"], el["length"])
        el["f_load"] = np.zeros(4, dtype=float)
        idx = el["dofs"]
        K[np.ix_(idx, idx)] += el["k"]

    for load in loads:
        t = _kind(load.get("type"))
        value = _num(load.get("value"), "load value")
        if t in {"point", "point_load"}:
            n = _node_index(nodes, xpos(load.get("position"), "point load position"))
            angle = np.deg2rad(_num(load.get("angle", 0), "point load angle"))
            F[v_dof[n]] -= value * np.cos(angle) * 1000.0
        elif t == "moment":
            n = _node_index(nodes, xpos(load.get("position"), "moment position"))
            rot = shared_rot.get(n)
            if rot is None:
                raise ValueError("A concentrated moment cannot be applied directly at an internal hinge")
            F[rot] += value * 1000.0
        else:
            a = xpos(load.get("position"), "UDL start")
            b = xpos(load.get("to"), "UDL end")
            q0 = value
            q1 = _num(load.get("value2", load.get("value_2", value)), "UDL end intensity")
            span = b - a
            for el in elements:
                ea, eb = nodes[el["i"]], nodes[el["j"]]
                if ea >= a - TOL and eb <= b + TOL:
                    t0 = (ea - a) / span
                    t1 = (eb - a) / span
                    qa = q0 + (q1 - q0) * t0
                    qb = q0 + (q1 - q0) * t1
                    fe = _linear_udl(qa, qb, eb - ea)
                    el["f_load"] += fe
                    F[np.array(el["dofs"])] += fe

    prescribed: dict[int, float] = {}
    support_meta = []
    for i, s in enumerate(supports, 1):
        t = _kind(s.get("type", "pin"))
        x = xpos(s.get("position"), f"support {i} position")
        n = _node_index(nodes, x)
        settlement = _num(s.get("settlement", 0), f"support {i} settlement") * 1e-3
        if t in {"internal_hinge", "internalhinge", "hinge"}:
            support_meta.append({"index": i, "type": "internal_hinge", "position": x})
            continue
        if t not in {"pin", "roller", "fixed"}:
            raise ValueError(f"Unsupported support type: {s.get('type')}")
        if n in hinges:
            raise ValueError("A conventional support cannot occupy the same node as an internal hinge")
        prescribed[v_dof[n]] = settlement
        if t == "fixed":
            prescribed[shared_rot[n]] = 0.0
        support_meta.append({"index": i, "type": t, "position": x, "settlement": settlement})

    if not prescribed:
        raise ValueError("The beam has no displacement restraints")

    fixed = np.array(sorted(prescribed), dtype=int)
    fixed_set = set(fixed.tolist())
    free = np.array([i for i in range(ndof) if i not in fixed_set], dtype=int)
    d = np.zeros(ndof, dtype=float)
    for i, value in prescribed.items():
        d[i] = value

    if free.size:
        try:
            Kff = K[np.ix_(free, free)]
            rhs = F[free] - K[np.ix_(free, fixed)] @ d[fixed]
            d[free] = np.linalg.solve(Kff, rhs)
        except np.linalg.LinAlgError as exc:
            raise ValueError("Beam model is unstable or insufficiently restrained") from exc

    residual = K @ d - F

    nodes_out = []
    for n, x in enumerate(nodes):
        left = d[elements[n - 1]["dofs"][3]] if n else None
        right = d[elements[n]["dofs"][1]] if n < len(elements) else None
        nodes_out.append({
            "x": x,
            "deflection_mm": d[v_dof[n]] * 1000,
            "rotation_rad_left": left,
            "rotation_rad_right": right,
            "is_internal_hinge": n in hinges,
        })

    reactions = []
    for meta in support_meta:
        if meta["type"] == "internal_hinge":
            reactions.append({**meta, "vertical_kN": 0.0, "moment_kNm": 0.0})
            continue
        n = _node_index(nodes, meta["position"])
        moment = residual[shared_rot[n]] / 1000.0 if meta["type"] == "fixed" else 0.0
        reactions.append({**meta, "vertical_kN": residual[v_dof[n]] / 1000.0, "moment_kNm": moment})

    hinge_checks = []
    for n in sorted(hinges):
        left_force = elements[n - 1]["k"] @ d[elements[n - 1]["dofs"]] - elements[n - 1]["f_load"]
        right_force = elements[n]["k"] @ d[elements[n]["dofs"]] - elements[n]["f_load"]
        hinge_checks.append({
            "position": nodes[n],
            "left_moment_kNm": left_force[3] / 1000.0,
            "right_moment_kNm": right_force[1] / 1000.0,
        })

    applied_vertical = 0.0
    for load in loads:
        t = _kind(load.get("type"))
        value = _num(load.get("value"), "load value")
        if t in {"point", "point_load"}:
            angle = np.deg2rad(_num(load.get("angle", 0), "point load angle"))
            applied_vertical -= value * np.cos(angle)
        elif t in {"udl", "distributed", "uniform"}:
            a = float(load["position"])
            b = float(load["to"])
            q1 = float(load.get("value2", load.get("value_2", value)))
            applied_vertical -= (value + q1) * (b - a) / 2.0
    reaction_sum = sum(r["vertical_kN"] for r in reactions)

    elements_out = []
    for el in elements:
        i, j = el["i"], el["j"]
        elements_out.append({
            "x0": nodes[i],
            "x1": nodes[j],
            "v0_mm": d[el["dofs"][0]] * 1000.0,
            "v1_mm": d[el["dofs"][2]] * 1000.0,
            "theta0_rad": d[el["dofs"][1]],
            "theta1_rad": d[el["dofs"][3]],
        })

    return {
        "nodes": nodes_out,
        "elements": elements_out,
        "reactions": reactions,
        "hinge_checks": hinge_checks,
        "equilibrium": {"vertical_error_kN": reaction_sum + applied_vertical},
        "dof_count": ndof,
    }
