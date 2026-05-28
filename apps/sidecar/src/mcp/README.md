# Tortuga MCP server

Expone las operaciones de Tortuga OS como tools MCP para que las invoques
desde Claude Code, Claude Desktop o cualquier cliente compatible.

## Tools disponibles (v0.2 — ~60 tools)

Agrupadas por dominio. Llamá `tools/list` desde el cliente para ver
la JSONSchema completa de cada una.

**Proyectos / Tasks / Agents**
- `tortuga_list_projects`, `tortuga_get_project_status`, `tortuga_get_project_roadmap`
- `tortuga_patch_project`, `tortuga_calculate_margin`
- `tortuga_get_design_review`, `tortuga_approve_design_review`, `tortuga_request_design_changes`
- `tortuga_instantiate_project`
- `tortuga_list_tasks`, `tortuga_get_task`, `tortuga_create_task`, `tortuga_patch_task`, `tortuga_delete_task`
- `tortuga_list_task_steps`, `tortuga_continue_task`, `tortuga_dump_task_state`
- `tortuga_list_agents`, `tortuga_get_agent`, `tortuga_run_agent`
- `tortuga_get_agent_run`, `tortuga_list_agent_runs`

**Pipeline control** (destrabar agentes y pasos sin SQL)
- `tortuga_coerce_step_verdict` — forzar done/rejected
- `tortuga_rewind_to_step` / `tortuga_rerun_step` / `tortuga_skip_step`
- `tortuga_set_rejection_context` — inyectar feedback para la próxima pasada
- `tortuga_park_task` / `tortuga_unpark_task`
- `tortuga_kill_run`

**Auto-mode + observabilidad**
- `tortuga_get_auto_mode`, `tortuga_set_auto_mode`
- `tortuga_list_active_runs`, `tortuga_get_task_timeline`
- `tortuga_list_notifications`, `tortuga_count_unread_notifications`, `tortuga_mark_notification_read`

**Clientes / Personas / Leads / Milestones / Propuestas**
- `tortuga_list_clients`, `tortuga_create_client`, `tortuga_patch_client`, `tortuga_delete_client`
- `tortuga_list_people`, `tortuga_create_person`, `tortuga_patch_person`, `tortuga_delete_person`
- `tortuga_list_leads`, `tortuga_patch_lead`, `tortuga_delete_lead`
- `tortuga_list_milestones`
- `tortuga_list_proposals`, `tortuga_create_proposal`, `tortuga_patch_proposal`, `tortuga_transition_proposal`

**Chat / Inbox**
- `tortuga_append_chat_message`, `tortuga_add_inbox_message`

**Secrets + Env**
- `tortuga_list_secrets`, `tortuga_set_secret`, `tortuga_delete_secret`
- `tortuga_request_env`, `tortuga_list_env_requests`

**Preflight**
- `tortuga_list_preflight_checks`, `tortuga_mark_preflight_check`
- `tortuga_skip_all_preflight`, `tortuga_commit_preflight`

## Conectar a Claude Code

Edita `~/.claude/settings.json` (o el `.claude/settings.json` del proyecto si quieres scope local) y añade:

```json
{
  "mcpServers": {
    "tortuga-os": {
      "command": "node",
      "args": [
        "E:\\dev\\tortuga-os\\apps\\sidecar\\dist-bundle\\mcp-server.cjs"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

Por defecto el MCP server lee `%APPDATA%\\Tortuga-OS\\tortuga.db` (la misma DB
que la app desktop). Si quieres que apunte a la DB sembrada con datos de dev
(`tortuga-os/data/dev/tortuga.db`), añade:

```json
"env": {
  "NODE_ENV": "production",
  "TORTUGA_DATA_DIR": "E:\\dev\\tortuga-os\\data\\dev"
}
```

Reinicia Claude Code. En el chat, escribe `/mcp` para ver los servers
conectados; debería listar `tortuga-os` con los 8 tools.

## Conectar a Claude Desktop

Edita `claude_desktop_config.json` (en Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tortuga-os": {
      "command": "node",
      "args": [
        "E:\\dev\\tortuga-os\\apps\\sidecar\\dist-bundle\\mcp-server.cjs"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

Reinicia Claude Desktop. Verás el ícono 🔌 con `tortuga-os` listado.

## Probar localmente sin cliente MCP

Hay un test de handshake que valida el server end-to-end:

```bash
cd apps/sidecar
pnpm build
node test-mcp-handshake.mjs
```

Spawnea el server, hace `initialize` + `tools/list` + 3 `tools/call` y
verifica las respuestas. Útil cuando agregues un tool nuevo.

## Cómo trabajar con el MCP desde el chat

Una vez conectado, los flujos típicos:

```
> ¿Qué proyectos tengo activos?
   (Claude usa tortuga_list_projects)

> ¿Cómo va ACM?
   (Claude usa tortuga_get_project_status con code=ACM)

> Muestra el kanban de ACM
   (Claude usa tortuga_get_kanban_board)

> ¿Qué tareas están esperando mi firma?
   (Claude filtra columnas con requiresHumanSignoff=true)

> Aprueba la T-29 a done
   (Claude usa tortuga_move_task con signed_by_human=true)

> ¿Cuál es el system prompt de qa-reviewer?
   (Claude usa tortuga_get_agent)
```

## Ejecución contra dev (con tsx, sin build)

Útil para iterar el código del MCP server sin reconstruir:

```bash
pnpm --filter @tortuga/sidecar dev:mcp
```

## Notas técnicas

- **Logs**: el server usa `process.stderr` para no contaminar stdout
  (que es el canal JSON-RPC). El sidecar HTTP usa `pino` por stdout
  normalmente; cuando arranca como MCP setea `TORTUGA_LOG_TO_STDERR=1`
  y pino redirige a fd 2.
- **DB compartida**: el MCP lee la misma SQLite que la app desktop.
  Si abres la app, mueves una card y luego usas el MCP, ves el cambio.
- **Concurrencia**: better-sqlite3 con WAL permite varios lectores
  + un escritor. Si la app y el MCP escriben simultáneo, SQLite
  serializa.
- **Migraciones**: el MCP corre las migraciones al arrancar (idempotente).
  Si todavía no abriste la app, el MCP crea la DB.
