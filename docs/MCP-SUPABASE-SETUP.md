# Setup del MCP Supabase para el Troubleshooter

El sidecar usa el [MCP server oficial de Supabase](https://supabase.com/docs/guides/getting-started/mcp) para aplicar las migrations SQL que el agente troubleshooter propone. Cada proyecto que use bugfixes con SQL necesita:

1. Una fila `mcp_connections` con `name='supabase'`.
2. Un secret de proyecto `SUPABASE_ACCESS_TOKEN`.
3. Un secret (o env) `SUPABASE_PROJECT_REF` con el ref del proyecto Supabase.

## 1. Generar un Personal Access Token

1. Abre <https://supabase.com/dashboard/account/tokens>.
2. **Generate new token**.
3. Nombre: `tortuga-os-troubleshooter`. Scope: el proyecto que quieras o "All projects".
4. Copia el token (`sbp_...`). Solo se muestra una vez.

> Importante: usa Personal Access Token (account-scoped), **no** el service_role del proyecto. El MCP server CLI lo requiere así.

## 2. Encontrar el Project Ref

En el dashboard de Supabase, abre el proyecto. La URL es:

```
https://supabase.com/dashboard/project/<PROJECT_REF>
```

Copia `<PROJECT_REF>` (algo tipo `abcdefghijklmnop`).

## 3. Registrar el MCP server en Tortuga

En el panel **MCP servers** de Tortuga (icono en el sidebar izquierdo), agrega una conexión:

| Campo | Valor |
| --- | --- |
| Name | `supabase` (en minúsculas, el sidecar busca exactamente este nombre) |
| Transport | `stdio` |
| Command | `npx` |
| Args (JSON array) | `["-y", "@supabase/mcp-server-supabase@latest"]` |
| Env (JSON object) | `{}` (el token se inyecta en runtime) |
| Enabled | ✅ |

> Si prefieres versión fija: `["-y", "@supabase/mcp-server-supabase@0.4.5"]` o la última que estés usando.

## 4. Guardar el token y el project_ref del proyecto

Abre el proyecto en Tortuga → **Secrets** y agrega DOS entradas (el token va encriptado, el project_ref también):

| Name | Value |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | el `sbp_...` del paso 1 |
| `SUPABASE_PROJECT_REF` | el ref del paso 2 |

> Alternativa: `SUPABASE_PROJECT_REF` puede ir en **Project Envs** en lugar de Secrets si no te importa que viva en texto plano. El sidecar busca primero secrets, después envs.

## 5. Probar

1. Crea un report de troubleshoot que el agente diagnostique con migrations SQL.
2. Click **Aplicar fix**. La UI mostrará una lista de "Migrations SQL" con `✓` o `✗` por cada una.
3. En caso de error: el report pasa a estado `escalated` y el detalle del error queda en el último output.

## Tools que el sidecar invoca

Hoy: `apply_migration`. Próximas iteraciones usarán también `execute_sql`, `list_tables`, `list_extensions`, `get_advisors`.

## Troubleshooting del troubleshooter

- **"No mcp_connections row named 'supabase' is enabled"** → falta paso 3.
- **"Project secret SUPABASE_ACCESS_TOKEN missing"** → falta paso 4 (token).
- **"SUPABASE_PROJECT_REF missing"** → falta paso 4 (project_ref).
- **"mcp request timed out: apply_migration"** → el MCP server tardó >60s. Revisa que la migration no tenga un lock de tabla grande; aplicar en horario de baja carga.
- **"Unauthorized" o 401 del MCP** → el token expiró o no tiene scope sobre ese project_ref. Genera uno nuevo y rota el secret.
