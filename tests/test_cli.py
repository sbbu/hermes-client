from __future__ import annotations

import plistlib
from pathlib import Path
from types import SimpleNamespace

import pytest

from hermes_client import cli
from hermes_client.dashboard import DashboardConnectionError


def test_worker_service_defaults_to_waiting_for_tailscale():
    args = cli.build_parser().parse_args(["worker-service-run"])
    assert args.host == "auto"
    assert args.wait_seconds == -1


def test_update_command_and_legacy_alias():
    assert cli.build_parser().parse_args(["update"]).func is cli.cmd_update
    assert cli.build_parser().parse_args(["self-update"]).func is cli.cmd_update


def test_main_prints_connection_errors_without_traceback(monkeypatch, capsys):
    def fail(args):
        raise DashboardConnectionError("cannot reach remote")

    monkeypatch.setattr(
        cli,
        "build_parser",
        lambda: SimpleNamespace(parse_args=lambda argv: SimpleNamespace(func=fail)),
    )

    with pytest.raises(SystemExit) as excinfo:
        cli.main([])

    assert excinfo.value.code == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == "error: cannot reach remote\n"


def test_update_uses_uv_not_venv_pip(tmp_path, monkeypatch):
    uv = tmp_path / "uv"
    uv.write_text("#!/bin/sh\n")
    uv.chmod(0o755)
    monkeypatch.setenv("UV", str(uv))
    calls = []

    def fake_run(argv, check=False, **kwargs):
        calls.append((argv, check, kwargs))
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(cli.subprocess, "run", fake_run)

    cli.cmd_update(SimpleNamespace())

    assert calls == [
        ([str(uv), "pip", "install", "--python", cli.sys.executable, "--upgrade", cli.INSTALL_SPEC], True, {})
    ]


def test_install_worker_writes_launchd_plist(tmp_path, monkeypatch, capsys):
    home = tmp_path / "home"
    (home / "Documents").mkdir(parents=True)
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setattr(cli, "_load_plist", lambda label, plist: None)
    monkeypatch.setattr(cli, "_resolve_worker_host", lambda host, wait_seconds=0: "100.1.2.3")

    args = cli.build_parser().parse_args(["install-worker", "--allow-root", str(home / "Documents")])
    args.func(args)

    plist = home / "Library" / "LaunchAgents" / "com.sbbu.hermes-client.worker.plist"
    assert plist.exists()
    data = plistlib.loads(plist.read_bytes())
    assert data["Label"] == "com.sbbu.hermes-client.worker"
    assert data["RunAtLoad"] is True
    assert data["KeepAlive"] is True
    argv = data["ProgramArguments"]
    assert "worker-service-run" in argv
    assert "--host" in argv
    assert "auto" in argv
    assert str(home / "Documents") in argv
    assert "local_worker:" in capsys.readouterr().out


def test_autoupdater_uses_valid_direct_reference(tmp_path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setattr(cli, "_load_plist", lambda label, plist: None)

    args = cli.build_parser().parse_args(["install-autoupdate"])
    args.func(args)

    plist = home / "Library" / "LaunchAgents" / "com.sbbu.hermes-client.updater.plist"
    data = plistlib.loads(plist.read_bytes())
    argv = data["ProgramArguments"]
    assert argv == [cli.sys.executable, "-m", "hermes_client.cli", "update"]
