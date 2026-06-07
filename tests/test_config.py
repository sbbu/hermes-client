from hermes_client.config import ClientConfig


def test_config_from_dict_normalizes_fields():
    cfg = ClientConfig.from_dict({"base_url": "http://x", "worker_roots": ["~/code"], "allow_mutating_shell": True})
    assert cfg.base_url == "http://x"
    assert cfg.worker_roots == ["~/code"]
    assert cfg.allow_mutating_shell is True
