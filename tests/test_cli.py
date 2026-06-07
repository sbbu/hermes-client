from __future__ import annotations

import plistlib
from pathlib import Path

from hermes_client import cli


def test_worker_service_defaults_to_waiting_for_tailscale():
    args = cli.build_parser().parse_args(["worker-service-run"])
    assert args.host == "auto"
    assert args.wait_seconds == -1


def test_update_command_and_legacy_alias():
    assert cli.build_parser().parse_args(["update"]).func is cli.cmd_update
    assert cli.build_parser().parse_args(["self-update"]).func is cli.cmd_update


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
    assert "hermes-client[worker] @ git+https://github.com/sbbu/hermes-client.git" in argv
