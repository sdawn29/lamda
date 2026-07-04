# MCP Servers

Model Context Protocol servers extend the tools available to the agent. lamda manages MCP server definitions globally through Settings, and the agent can call connected MCP tools during chat sessions.

> Screenshot needed: capture `/settings/mcp` with the MCP server list visible.

## Add a Server

1. Open `Settings -> MCP Servers`.
2. Click `Add Server`.
3. Enter a name.
4. Enter the command and arguments.
5. Set the working directory if the server needs one.
6. Add environment variables such as tokens.
7. Save the server.
8. Start or reconnect it if the UI exposes a connection action.

> Screenshot needed: capture the add MCP server dialog in `/settings/mcp`.

## Edit a Server

1. Open `Settings -> MCP Servers`.
2. Select the server.
3. Change command, arguments, environment variables, or description.
4. Save.
5. Restart the server if required.

## Remove a Server

1. Open the server menu.
2. Choose remove.
3. Confirm.

Removing a server stops making its tools available to new agent sessions.

## Common Server Types

| Server     | Typical purpose                                     |
| ---------- | --------------------------------------------------- |
| Filesystem | Give the agent scoped access to extra folders       |
| GitHub     | Read issues, PRs, repositories, and GitHub API data |
| Search     | Let the agent query external search providers       |
| Database   | Expose structured project data through MCP          |
| Custom     | Connect internal tools that speak MCP               |

## Use MCP in Chat

1. Connect the server in settings.
2. Open a thread.
3. Ask for work that needs the server, such as reading an issue, querying a docs source, or checking an external service.
4. Watch MCP tool calls appear as normal tool blocks in chat.

## Security Notes

MCP servers can expose powerful tools. Add only servers you trust, scope filesystem access carefully, and store tokens in environment variables instead of plain text where possible.
