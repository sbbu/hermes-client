# Remote-host MCP config for the local worker

The installer creates a launchd worker service automatically:

```bash
hermes-client install-worker
```

The worker binds to the local machine's Tailscale IPv4 address when available. Print the config block for the remote Hermes host:

```bash
hermes-client mcp-config
```

Example:

```yaml
mcp_servers:
  local_worker:
    url: "http://<local-tailscale-ip>:8766/mcp"
    enabled: true
    timeout: 120
    connect_timeout: 30
    tools:
      resources: false
      prompts: false
```

Then restart the remote Hermes gateway or start a fresh session so it discovers the MCP tools.

Expected tools:

- `local_info`
- `local_read_file`
- `local_write_file`
- `local_search_files`
- `local_run`
- `local_computer_use_status`
