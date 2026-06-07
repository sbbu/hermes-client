from hermes_client.cli import build_parser, cmd_tui
from hermes_client.tui import packaged_tui_entry


def test_default_command_is_full_tui():
    args = build_parser().parse_args([])
    assert args.func is cmd_tui


def test_packaged_tui_entry_exists():
    entry = packaged_tui_entry()
    assert entry.name == "entry.js"
    assert entry.is_file()
