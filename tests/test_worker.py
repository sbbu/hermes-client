import pytest

from hermes_client.worker import assert_under_roots, command_allowed, mcp_config_text


def test_mcp_config_uses_generic_local_worker_name():
    cfg = mcp_config_text("100.1.2.3", 8766)
    assert "local_worker:" in cfg
    assert "http://100.1.2.3:8766/mcp" in cfg


def test_assert_under_roots_allows_nested(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    child = root / "a.txt"
    child.write_text("x")
    assert assert_under_roots(child, [root.resolve()]) == child.resolve()


def test_assert_under_roots_blocks_outside(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("x")
    with pytest.raises(ValueError):
        assert_under_roots(outside, [root.resolve()])


def test_command_guard_blocks_destructive_shell():
    assert command_allowed("pytest -q")
    assert not command_allowed("rm -rf build")
    assert command_allowed("rm -rf build", allow_mutating=True)
