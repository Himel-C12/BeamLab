import pytest

from solver import InternalHinge, solve_beam


def test_internal_hinge_is_a_release_object():
    hinge = InternalHinge(8.0)
    assert hinge.position == 8.0


def test_solver_does_not_fabricate_results():
    with pytest.raises(NotImplementedError):
        solve_beam({})
