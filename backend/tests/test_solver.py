from solver import solve_beam


def test_simply_supported_center_point_load():
    result = solve_beam({
        "spans": [{"length": 8, "E": 200, "I": 1e8}],
        "supports": [
            {"type": "pin", "position": 0},
            {"type": "roller", "position": 8},
        ],
        "loads": [{"type": "point", "value": 10, "position": 4}],
    })
    reactions = result["reactions"]
    assert abs(reactions[0]["vertical_kN"] - 5.0) < 1e-8
    assert abs(reactions[1]["vertical_kN"] - 5.0) < 1e-8
    assert abs(result["equilibrium"]["vertical_error_kN"]) < 1e-8


def test_internal_hinge_has_zero_moment_and_no_reaction():
    result = solve_beam({
        "spans": [{"length": 14, "E": 200, "I": 1e8}],
        "supports": [
            {"type": "pin", "position": 0},
            {"type": "fixed", "position": 14},
            {"type": "internal_hinge", "position": 8},
        ],
        "loads": [
            {"type": "point", "value": 8, "position": 3},
            {"type": "point", "value": 10, "position": 6},
            {"type": "udl", "value": 4, "position": 8, "to": 14},
        ],
    })
    hinge = result["hinge_checks"][0]
    assert abs(hinge["left_moment_kNm"]) < 1e-7
    assert abs(hinge["right_moment_kNm"]) < 1e-7
    hinge_reaction = next(r for r in result["reactions"] if r["type"] == "internal_hinge")
    assert hinge_reaction["vertical_kN"] == 0.0
    assert hinge_reaction["moment_kNm"] == 0.0
    assert abs(result["equilibrium"]["vertical_error_kN"]) < 1e-7


def test_unstable_model_is_rejected():
    try:
        solve_beam({
            "spans": [{"length": 5, "E": 200, "I": 1e8}],
            "supports": [{"type": "pin", "position": 0}],
            "loads": [{"type": "point", "value": 1, "position": 2.5}],
        })
    except ValueError as exc:
        assert "unstable" in str(exc).lower() or "restrained" in str(exc).lower()
    else:
        raise AssertionError("An unstable beam must not produce a result")


def test_bmd_jump_rules_for_mixed_loading():
    from diagrams import build_diagrams

    model = {
        "spans": [{"length": 24}],
        "loads": [
            {"type": "udl", "value": 2, "value2": 2, "position": 0, "to": 6},
            {"type": "moment", "value": -42.5, "position": 6},
            {"type": "point", "value": 10, "position": 11},
            {"type": "udl", "value": 2, "value2": 2, "position": 16, "to": 24},
            {"type": "moment", "value": -12, "position": 24},
        ],
    }
    result = {
        "reactions": [
            {"type": "roller", "position": 6, "vertical_kN": 8.75, "moment_kNm": 0},
            {"type": "roller", "position": 16, "vertical_kN": 29.25, "moment_kNm": 0},
        ],
        "elements": [],
        "nodes": [],
        "hinge_checks": [],
    }
    jumps = build_diagrams(model, result)["jumps"]

    def at(position):
        return [j for j in jumps if abs(j["x"] - position) < 1e-9]

    assert abs(at(6)[1]["moment_kNm"] - at(6)[0]["moment_kNm"] - 42.5) < 1e-8
    assert abs(at(11)[1]["moment_kNm"] - at(11)[0]["moment_kNm"]) < 1e-8
    assert abs(at(11)[1]["shear_kN"] - at(11)[0]["shear_kN"] + 10) < 1e-8
    assert abs(at(16)[1]["moment_kNm"] - at(16)[0]["moment_kNm"]) < 1e-8
    assert abs(at(24)[1]["moment_kNm"] - at(24)[0]["moment_kNm"] - 12) < 1e-8
    assert abs(at(24)[1]["shear_kN"] - at(24)[0]["shear_kN"]) < 1e-8


def test_solved_simply_supported_full_span_udl_diagrams():
    from diagrams import build_diagrams

    model = {
        "spans": [{"length": 10, "E": 200, "I": 1e8}],
        "supports": [
            {"type": "pin", "position": 0},
            {"type": "roller", "position": 10},
        ],
        "loads": [{"type": "udl", "value": 5, "position": 0, "to": 10}],
    }
    solved = solve_beam(model)
    reactions = solved["reactions"]
    assert abs(reactions[0]["vertical_kN"] - 25.0) < 1e-7
    assert abs(reactions[1]["vertical_kN"] - 25.0) < 1e-7
    assert abs(solved["equilibrium"]["vertical_error_kN"]) < 1e-7

    diagrams = build_diagrams(model, solved)
    mid = min(diagrams["samples"], key=lambda s: abs(s["x"] - 5.0))
    assert abs(mid["moment_kNm"] - 62.5) < 1e-6

    end_jump = [j for j in diagrams["jumps"] if abs(j["x"] - 10.0) < 1e-9]
    assert len(end_jump) == 2
    assert abs(end_jump[0]["moment_kNm"]) < 1e-7
    assert abs(end_jump[1]["moment_kNm"]) < 1e-7
    assert abs(end_jump[0]["shear_kN"] + 25.0) < 1e-7
    assert abs(end_jump[1]["shear_kN"]) < 1e-7


def test_solved_cantilever_tip_load_bmd_and_fixed_reaction_couple():
    from diagrams import build_diagrams

    model = {
        "spans": [{"length": 6, "E": 200, "I": 1e8}],
        "supports": [{"type": "fixed", "position": 0}],
        "loads": [{"type": "point", "value": 12, "position": 6}],
    }
    solved = solve_beam(model)
    reaction = solved["reactions"][0]
    assert abs(reaction["vertical_kN"] - 12.0) < 1e-7
    assert abs(abs(reaction["moment_kNm"]) - 72.0) < 1e-7
    assert abs(solved["equilibrium"]["vertical_error_kN"]) < 1e-7

    diagrams = build_diagrams(model, solved)
    mid = min(diagrams["samples"], key=lambda s: abs(s["x"] - 3.0))
    assert abs(mid["shear_kN"] - 12.0) < 1e-7
    assert abs(mid["moment_kNm"] + 36.0) < 1e-6
    tip = [j for j in diagrams["jumps"] if abs(j["x"] - 6.0) < 1e-9]
    assert len(tip) == 2
    assert abs(tip[0]["moment_kNm"]) < 1e-7
    assert abs(tip[1]["moment_kNm"]) < 1e-7
    assert abs(tip[0]["shear_kN"] - 12.0) < 1e-7
    assert abs(tip[1]["shear_kN"]) < 1e-7
