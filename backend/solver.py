"""BeamLab structural analysis engine.

Euler-Bernoulli direct-stiffness solver for prismatic/multi-span beams.
Internal hinges are modeled as true rotational releases: the vertical DOF is
shared across the hinge while the rotations on its two sides are independent.
The module is deliberately independent of FastAPI and the browser UI.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isclose
from typing import Any

import numpy as np


TOL = 1e-9


@dataclass(frozen=True)
class InternalHinge:
    position: float


def _norm_type(value: str) -> str:
    return value.strip().lower().replace(" ", "_").replace("-", "_")


def _number(value: Any, name: str) -> float:
    try:
        x = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be numeric") from exc
    if not np.isfinite(x):
        raise ValueError(f"{name} must be finite")
    return x


def _unique_positions(values: list[float], tol: float = TOL) -> list[float]:
    out: list[float] = []
    for x in sorted(values):
        if not out or abs(x - out[-1]) > tol:
            out.append(x)
    return out


def _beam_stiffness(EI: float, length: float) -> np.ndarray:
    l2 = length * length
    l3 = l2 * length
    return (EI / l3) * np.array(
        [
            [12.0, 6.0 * length, -12.0, 6.0 * length],
            [6.0 * length, 4.0 * l2, -6.0 * length, 2.0 * l2],
            [-12.0, -6.0 * length, 12.0, -6.0 * length],
            [6.0 * length, 2.0 * l2, -6.0 * length, 4.0 * l2],
        ],
        dtype=float,
    )


def _udl_vector(q_down: float, length: float) -> np.ndarray:
    """Consistent nodal load vector; positive vertical load is upward."""
    return np.array(
        [-q_down * length / 2.0, -q_down * length**2 / 12.0,
         -q_down * length / 2.0, q_down * length**2 / 12.0],
        dtype=float,
    )


def _find_node(nodes: list[float], x: float) -> int:
    for i, p in enumerate(nodes):
        if abs(p - x) <= TOL:
            return i
    raise ValueError(f"Position {x:g} does not coincide with an analysis node")


def solve_beam(model: dict) -> dict:
    """Solve a beam model using the Euler-Bernoulli direct-stiffness method.

    Expected model shape::

        {"spans": [{"length": 8, "E": 200, "I": 1e8}, ...],
         "supports": [{"type": "pin|roller|fixed|internal_hinge",
                       "position": 0, "settlement": 0}],
         "loads": [{"type": "point", "value": 10, "position": 4},
                   {"type": "udl", "value": 4, "position": 4, "to": 8},
                   {"type": "moment", "value": 5, "position": 8}]}

    E is in GPa and I in mm^4, lengths in metres, forces in kN and moments
    in kN-m. The solver converts E/I internally to consistent SI stiffness
    and returns engineering results in kN, kN-m, mm and radians.
    """
    spans = model.get("spans") or []
    supports = model.get("supports") or []
    loads = model.get("loads") or []
    if not spans:
        raise ValueError("At least one beam span is required")

    # Span boundaries carry the section properties used by each element.
    span_data: list[tuple[float, float, float]] = []
    x0 = 0.0
    for i, span in enumerate(spans, 1):
        length = _number(span.get("length"), f"span {i} length")
        E_gpa = _number(span.get("E", 200.0), f"span {i} E")
        I_mm4 = _number(span.get("I", 1e8), f"span {i} I")
        if length <= 0 or E_gpa <= 0 or I_mm4 <= 0:
            raise ValueError(f"span {i} length, E and I must be positive")
        span_data.append((x0, x0 + length, E_gpa * 1e9, I_mm4 * 1e-12))
        x0 += length
    total_length = x0

    def check_x(x: float, label: str) -> float:
        x = _number(x, label)
        if x < -TOL or x > total_length + TOL:
            raise ValueError(f"{label}={x:g} lies outside the beam")
        return min(total_length, max(0.0, x))

    # Every discontinuity becomes a node. This makes point loads and UDL ends
    # exact rather than approximated by the plotting mesh.
    positions = [0.0, total_length]
    hinge_positions: list[float] = []
    for i, s in enumerate(supports, 1):
        x = check_x(s.get("position"), f"support {i} position")
        positions.append(x)
        if _norm_type(str(s.get("type", ""))) in {"internal_hinge", "internalhinge", "hinge"}:
            hinge_positions.append(x)
    for i, load in enumerate(loads, 1):
        kind = _norm_type(str(load.get("type", "")))
        if kind in {"point", "point_load", "moment"}:
            positions.append(check_x(load.get("position"), f"load {i} position"))
        elif kind in {"udl", "distributed", "uniform"}:
            a = check_x(load.get("position"), f"load {i} start")
            b = check_x(load.get("to"), f"load {i} end")
            if b <= a + TOL:
                raise ValueError(f"UDL {i} must have end > start")
            positions.extend([a, b])
        else:
            raise ValueError(f"Unsupported load type: {load.get('type')}")

    nodes = _unique_positions(positions)
    hinges = {min(nodes, key=lambda p: abs(p - x)) for x in hinge_positions}

    # Vertical displacement is always shared. Rotation is shared at ordinary
    # nodes but deliberately split into two DOFs at an internal hinge.
    dof = 0
    v_dof: list[int] = []
    for _ in nodes:
        v_dof.append(dof)
        dof += 1

    elements: list[dict[str, Any]] = []
    for e in range(len(nodes) - 1):
        a, b = nodes[e], nodes[e + 1]
        mid = (a + b) / 2.0
        section = next((s for s in span_data if s[0] - TOL <= mid <= s[1] + TOL), None)
        if section is None:
            raise ValueError("Unable to assign section properties to an element")
        _, _, E, I = section
        r1 = dof
        dof += 1
        r2 = dof
        dof += 1
        # Merge rotations at non-hinge nodes by assigning canonical IDs later.
        elements.append({"i": e, "j": e + 1, "E": E, "I": I, "r1": r1, "r2": r2})

    # Replace element-end rotations with shared node rotation DOFs where
    # appropriate. At a hinge each side retains its unique rotational DOF.
    shared_rot: dict[int, int] = {}
    for n, x in enumerate(nodes):
        if x not in hinges:
            incident = []
            if n > 0:
                incident.append(elements[n - 1]["r2"])
            if n < len(elements):
                incident.append(elements[n]["r1"])
            if incident:
                shared_rot[n] = incident[0]
                for el in elements:
                    if el["r1"] == incident[-1] and el["i"] == n:
                        el["r1"] = incident[0]
                    if el["r2"] == incident[-1] and el["j"] == n:
                        el["r2"] = incident[0]

    # Compact DOF numbering after rotation merging.
    used = list(v_dof)
    for el in elements:
        used.extend([el["r1"], el["r2"]])
    remap = {old: new for new, old in enumerate(sorted(set(used)))}
    v_dof = [remap[x] for x in v_dof]
    for el in elements:
        el["dofs"] = [remap[el["i"] and elements[el["i"]]["r1"] if False else el["r1"]],
                      remap[el["r1"]], remap[el["j"] and elements[el["j"]]["r2"] if False else el["r2"]]]
    # Rebuild the four DOFs cleanly; the expression above intentionally avoids
    # any hidden global indexing and is overwritten immediately below.
    for el in elements:
        el["dofs"] = [v_dof[el["i"]], remap[el["r1"]], v_dof[el["j"]], remap[el["r2"]]]
    ndof = len(remap)

    K = np.zeros((ndof, ndof), dtype=float)
    F = np.zeros(ndof, dtype=float)

    # Add member stiffness and exact UDL equivalent nodal loads.
    for el in elements:
        L = nodes[el["j"]] - nodes[el["i"]]
        el["length"] = L
        el["k"] = _beam_stiffness(el["E"] * el["I"], L)
        idx = el["dofs"]
        K[np.ix_(idx, idx)] += el["k"]
        el["f_load"] = np.zeros(4, dtype=float)

    # Applied loads in kN/kN-m are converted to N/N-m for the linear system.
    for load in loads:
        kind = _norm_type(str(load.get("type")))
        value = _number(load.get("value"), "load value")
        if kind in {"point", "point_load"}:
            n = _find_node(nodes, check_x(load.get("position"), "point load position"))
            F[v_dof[n]] += -value * 1000.0
        elif kind == "moment":
            x = check_x(load.get("position"), "moment position")
            n = _find_node(nodes, x)
            # Positive moment is counter-clockwise.
            rot = next((el["dofs"][1] for el in elements if el["i"] == n), None)
            if rot is None:
                rot = next((el["dofs"][3] for el in elements if el["j"] == n), None)
            F[rot] += value * 1000.0
        else:
            a = check_x(load.get("position"), "UDL start")
            b = check_x(load.get("to"), "UDL end")
            q = value
            for el in elements:
                ea, eb = nodes[el["i"]], nodes[el["j"]]
                if ea >= a - TOL and eb <= b + TOL:
                    fe = _udl_vector(q, eb - ea) * 1000.0
                    el["f_load"] += fe
                    F[np.array(el["dofs"])] += fe

    prescribed: dict[int, float] = {}
    support_records: list[dict[str, Any]] = []
    for i, s in enumerate(supports, 1):
        kind = _norm_type(str(s.get("type", "pin")))
        x = check_x(s.get("position"), f"support {i} position")
        n = _find_node(nodes, x)
        settlement = _number(s.get("settlement", 0.0), f"support {i} settlement") * 1e-3
        if kind in {"internal_hinge", "internalhinge", "hinge"}:
            support_records.append({"index": i, "type": "internal_hinge", "position": x, "vertical": 0.0, "moment": 0.0})
            continue
        if kind not in {"pin", "roller", "fixed"}:
            raise ValueError(f"Unsupported support type: {s.get('type')}")
        prescribed[v_dof[n]] = settlement
        if kind == "fixed":
            # Ordinary fixed support has a shared rotation DOF.
            rot = None
            if n in shared_rot:
                rot = remap[shared_rot[n]]
            else:
                for el in elements:
                    if el["i"] == n:
                        rot = el["dofs"][1]
                        break
                    if el["j"] == n:
                        rot = el["dofs"][3]
                        break
            if rot is None:
                raise ValueError("Fixed support has no rotational DOF")
            prescribed[rot] = 0.0
        support_records.append({"index": i, "type": kind, "position": x, "settlement": settlement})

    if not prescribed:
        raise ValueError("The beam has no displacement restraints")

    fixed = np.array(sorted(prescribed), dtype=int)
    free = np.array([i for i in range(ndof) if i not in set(fixed)], dtype=int)
    d = np.zeros(ndof, dtype=float)
    for i, value in prescribed.items():
        d[i] = value
    if free.size:
        Kff = K[np.ix_(free, free)]
        rhs = F[free] - K[np.ix_(free, fixed)] @ d[fixed]
        try:
            d[free] = np.linalg.solve(Kff, rhs)
        except np.linalg.LinAlgError as exc:
            raise ValueError("Beam model is unstable or insufficiently restrained") from exc

    residual = K @ d - F

    # Return node displacement/rotation data. At an internal hinge, expose both
    # side rotations so a rotation discontinuity is explicit rather than hidden.
    node_results = []
    for n, x in enumerate(nodes):
        left_rot = None
        right_rot = None
        if n > 0:
            left_rot = d[elements[n - 1]["dofs"][3]]
        if n < len(elements):
            right_rot = d[elements[n]["dofs"][1]]
        node_results.append({
            "x": x,
            "deflection_mm": d[v_dof[n]] * 1000.0,
            "rotation_rad_left": left_rot,
            "rotation_rad_right": right_rot,
            "is_internal_hinge": x in hinges,
        })

    # Reactions are recovered from Kd-F. At an internal hinge they are exactly
    # zero by construction and are never reported as a support reaction.
    reactions = []
    for rec in support_records:
        if rec["type"] == "internal_hinge":
            reactions.append({**rec, "vertical_kN": 0.0, "moment_kNm": 0.0})
            continue
        n = _find_node(nodes, rec["position"])
        v_reaction = residual[v_dof[n]] / 1000.0
        m_reaction = 0.0
        if rec["type"] == "fixed":
            rot_dof = None
            for el in elements:
                if el["i"] == n:
                    rot_dof = el["dofs"][1]
                    break
                if el["j"] == n:
                    rot_dof = el["dofs"][3]
                    break
            m_reaction = residual[rot_dof] / 1000.0 if rot_dof is not None else 0.0
        reactions.append({**rec, "vertical_kN": v_reaction, "moment_kNm": m_reaction})

    # Exact internal-hinge moment check from member end forces.
    hinge_checks = []
    for x in sorted(hinges):
        n = _find_node(nodes, x)
        left_m = right_m = 0.0
        if n > 0:
            el = elements[n - 1]
            left_m = (el["k"] @ d[np.array(el["dofs"])] - el["f_load"])[3] / 1000.0
        if n < len(elements):
            el = elements[n]
            right_m = (el["k"] @ d[np.array(el["dofs"])] - el["f_load"])[1] / 1000.0
        hinge_checks.append({"position": x, "left_moment_kNm": left_m, "right_moment_kNm": right_m})

    # Global equilibrium check in engineering units.
    total_vertical = sum(r["vertical_kN"] for r in reactions)
    applied_vertical = 0.0
    for load in loads:
        kind = _norm_type(str(load.get("type")))
        value = _number(load.get("value"), "load value")
        if kind in {"point", "point_load"}:
            applied_vertical -= value
        elif kind in {"udl", "distributed", "uniform"}:
            a = _number(load.get("position"), "UDL start")
            b = _number(load.get("to"), "UDL end")
            applied_vertical -= value * (b - a)
    equilibrium_error = total_vertical + applied_vertical

    return {
        "nodes": node_results,
        "reactions": reactions,
        "hinge_checks": hinge_checks,
        "equilibrium": {"vertical_error_kN": equilibrium_error},
        "dof_count": ndof,
    }
