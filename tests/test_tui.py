from hermes_client import tui
from hermes_client.cli import build_parser, cmd_tui
from hermes_client.tui import packaged_tui_entry


def test_default_command_is_full_tui():
    args = build_parser().parse_args([])
    assert args.func is cmd_tui


def test_packaged_tui_entry_exists():
    entry = packaged_tui_entry()
    assert entry.name == "entry.js"
    assert entry.is_file()


def test_packaged_tui_double_escape_preserves_complete_expanded_draft():
    bundle = packaged_tui_entry().read_text()
    assert 'expandTokens(cState.tokens)([...cState.inputBuf, cState.input].join("\\n"))' in bundle
    assert "cActions.pushHistory(draft)" in bundle


def test_packaged_tui_has_client_branding_and_updater():
    bundle = packaged_tui_entry().read_text()
    assert 'name: "Hermes Client"' in bundle
    stock_org = "Nous " + "Research"
    assert stock_org not in bundle
    assert 'TAG_FULL = "Hermes Client"' in bundle
    assert 'info.update_command || "hermes-client update"' in bundle
    stock_tagline = "Messenger of the " + "Digital Gods"
    assert stock_tagline not in bundle


def test_run_tui_overrides_inherited_local_agent_env(tmp_path, monkeypatch):
    app_dir = tmp_path / "client-config"
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("HERMES_HOME", "/real/hermes-home")
    monkeypatch.setenv("HERMES_CWD", "/stale/cwd")
    monkeypatch.setenv("HERMES_BIN", "hermes")
    monkeypatch.setattr(tui, "APP_DIR", app_dir)
    monkeypatch.setattr(tui, "ensure_app_dir", lambda: app_dir.mkdir(parents=True, exist_ok=True))
    monkeypatch.setattr(tui, "resolve_node", lambda: "/mock/bin/node")
    monkeypatch.setattr(
        tui.shutil,
        "which",
        lambda name: "/mock/bin/hermes-client" if name == "hermes-client" else None,
    )

    class FakeDashboardClient:
        def __init__(self, base_url):
            self.base_url = base_url

        def websocket_url(self):
            return "ws://remote.example/api/ws?token=redacted"

    captured = {}

    def fake_call(argv, env):
        captured["argv"] = argv
        captured["env"] = env
        return 7

    monkeypatch.setattr(tui, "DashboardClient", FakeDashboardClient)
    monkeypatch.setattr(tui.subprocess, "call", fake_call)

    assert tui.run_tui("http://remote.example", query="say ok", inline=True, mouse=False) == 7

    env = captured["env"]
    assert env["HERMES_TUI_GATEWAY_URL"] == "ws://remote.example/api/ws?token=redacted"
    assert env["HERMES_HOME"] == str(app_dir / "hermes-home")
    assert env["HERMES_CWD"] == str(tmp_path)
    assert env["HERMES_BIN"] == "/mock/bin/hermes-client"
