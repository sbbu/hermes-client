# Mac mini config for MacBook local worker

Run the worker on the MacBook, bound to its Tailscale IP:

```bash
hermes-client worker --host <macbook-tailscale-ip> --port 8766 --allow-root ~/code --allow-root ~/Documents
```

Add to the Mac mini Hermes config:

```yaml
mcp_servers:
  macbook:
    url: "http://<macbook-tailscale-ip>:8766/mcp"
    enabled: true
    timeout: 120
    connect_timeout: 30
    tools:
      resources: false
      prompts: false
```

Then restart the Mac mini gateway / start a fresh session so Hermes discovers the MCP tools.

Expected tools:

- `macbook_info`
- `macbook_read_file`
- `macbook_write_file`
- `macbook_search_files`
- `macbook_run`
- `macbook_computer_use_status`
