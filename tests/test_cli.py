from __future__ import annotations

import plistlib
from pathlib import Path

from hermes_client import cli


def test_worker_service_defaults_to_waiting_for_tailscale():
    args = cli.build_parser().parse_args(["worker-service-run"])
    assert args.host == "auto"
    assert args.wait_seconds == -1


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
