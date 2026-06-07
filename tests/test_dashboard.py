from hermes_client.dashboard import build_ws_url, extract_session_token, normalize_base_url


def test_normalize_base_url_adds_scheme_and_strips_trailing_slash():
    assert normalize_base_url("100.1.2.3:9119/") == "http://100.1.2.3:9119"


def test_build_ws_url_preserves_prefix():
    assert build_ws_url("https://x.test/hermes", "ticket", "abc") == "wss://x.test/hermes/api/ws?ticket=abc"


def test_extract_session_token():
    html = '<script>window.__HERMES_SESSION_TOKEN__="tok123"; window.x=1</script>'
    assert extract_session_token(html) == "tok123"
