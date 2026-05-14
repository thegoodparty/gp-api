# MCP Module

Exposes gp-api as a Model Context Protocol server. Any controller route can opt in as an agent-callable tool by adding `@McpTool({ description })` next to its existing decorators; calls land at `POST /v1/mcp` (JSON-RPC over HTTP) and are dispatched into the host's normal request pipeline via `fastify.inject` — auth, validation, interceptors, and business logic all unchanged.

The module is deliberately host-agnostic: it does not know who is calling, why, or whether the caller is an agent. `/v1/mcp` runs behind the global `SessionGuard` and is callable by any authenticated user. Narrower auth (e.g., locking the endpoint to a specific actor identity) belongs on top of this module, not inside it.

## Opting a route in

Add `@McpTool({ description })` alongside the existing decorators on the handler. Description is what the calling agent reads to decide whether to call the tool — write it for an LLM, not a human reviewer.

```ts
@Get('mine')
@ResponseSchema(CampaignWithLiveContextSchema)
@McpTool({
  description:
    "Read the calling user's active campaign, including organization " +
    'and live status. Use this on startup to understand who the user is, ' +
    'what office they are running for, and what state the campaign is in.',
})
@UseCampaign({ include: { organization: true } })
async findMine(@ReqCampaign() campaign: ...) { ... }
```

That's the entire dev-facing surface. Method, path, input/output schemas, and tool name are reflected from existing decorators at request time. Tool name = `${HTTP_METHOD}_${slug(controllerPath + methodPath)}` (e.g. `GET_campaigns_mine`) — the slug step is forced by Anthropic's tool-name regex `^[a-zA-Z0-9_-]{1,64}$`.

## Constraints

`gatherTools()` enforces these at request time and throws with a list of every violation. The live integration test boots the app and triggers the walk, so a CI run catches misconfigured tools before merge.

- `@McpTool` must be on a route handler with an HTTP method decorator (`@Get`, `@Post`, ...).
- `@ResponseSchema(...)` is required.
- If `@Body`/`@Query`/`@Param` is declared, it must use a `createZodDto` class. Untyped params (e.g. `@Body() x: object`) are rejected.
- If the route path contains `:placeholder`, `@Param() ... : SomeDto` is required — catches "forgot to read the path param" mistakes.
- Tool names must be unique across the registry (the slug rule means `/users/me` and `/users-me` would collide; not realistic today but worth knowing).

## Request flow

```
POST /v1/mcp                          (Accept: application/json, text/event-stream)
   │
   ▼
McpController.handle
   │  mcp.createServer()                    ← fresh Server per request
   │  StreamableHTTPServerTransport         ← enableJsonResponse=true, stateless
   ▼
SDK dispatches { tools/list | tools/call }
   │
   ├── tools/list:  gatherTools() → toMcpTool(...) → JSON-RPC response
   │
   └── tools/call:  gatherTools() → resolve by name → fastify.inject({
                       method, url=`${globalPrefix}${tool.path}`,
                       headers=<inbound, denylist hop-by-hop>,
                       payload=arguments.body,
                     })
                   → wrap as { content: [{type:'text', text:<body>}], isError: status>=400 }
```

The inner `fastify.inject` re-enters the host's full request pipeline: global guards (`SessionGuard`, `RolesGuard`), pipes, interceptors (`ZodResponseInterceptor`), the actual handler. A tool call is, behaviorally, an internal proxy of an HTTP request.

### Why a fresh `Server` per request

The MCP SDK's `Server.connect(transport)` throws on a re-attached transport. A singleton Server would fail on the second concurrent request (race on `_transport`). `new Server` is cheap and idiomatic for stateless Streamable HTTP — the SDK examples do the same.

### Header forwarding

The MCP SDK surfaces the inbound HTTP request's headers via `extra.requestInfo` in each handler. The call_tool handler forwards almost everything onto `fastify.inject` so the inner handler sees the same auth and context the outer caller sent (`Authorization` for `SessionGuard`, `x-organization-slug` for `UseCampaign`, correlation IDs, etc.). A small denylist (`host`, `content-length`, `transfer-encoding`, `accept-encoding`, ...) drops HTTP-machinery headers that fastify.inject will set itself.

### Tool name → URL

`gatherTools()` records each tool's `path` as `controllerPath + methodPath` — **without** the global prefix. The host's global prefix (`v1`) is applied at dispatch time via `ApplicationConfig.getGlobalPrefix()`. Keeps the registry decoupled from how the app is mounted (and keeps the unit tests simple — they don't need to know the prefix).

## Calling `/v1/mcp`

Standard MCP JSON-RPC over HTTP. Two non-obvious things:

- `Accept: application/json, text/event-stream` is **required** by the MCP Streamable HTTP transport spec. Without it the server returns `406 Not Acceptable`.
- `tools/call` takes `arguments: { body?, query?, params? }` — each maps to the matching `@Body`/`@Query`/`@Param` on the underlying route. Zero-arg routes pass `arguments: {}`.

```http
POST /v1/mcp
Authorization: Bearer <session-jwt>
Accept: application/json, text/event-stream
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "GET_campaigns_mine",
    "arguments": {}
  }
}
```

## Files

| File                                      | Purpose                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `mcp.module.ts`                           | Nest module — provides `McpServerService`, exposes `McpController` at `/mcp`                                                    |
| `mcp.controller.ts`                       | `@All()` handler — builds a per-request `Server` + transport, delegates to `transport.handleRequest`                            |
| `services/mcpServer.service.ts`           | `createServer()`, `gatherTools()` (walk + validate), `getTools()` (test seam), `buildUrl()`                                     |
| `services/mcpServer.service.live.test.ts` | CI gate — boots the real app via `useTestService()`, POSTs JSON-RPC to `/v1/mcp`, asserts list + call work end-to-end           |
| `services/mcpServer.service.test.ts`      | Unit tests against synthetic controller fixtures via `Test.createTestingModule` — fast, exercise gather/validate/dispatch logic |
| `decorators/McpTool.decorator.ts`         | `@McpTool({ description })` — only dev-facing decorator                                                                         |
| `util/toolName.util.ts`                   | `deriveToolName(method, path)` — slugs the path to fit Anthropic's regex                                                        |
| `util/schemaReflect.util.ts`              | Walks `ROUTE_ARGS_METADATA` + `design:paramtypes` to pull Zod schemas off `@Body/@Query/@Param` DTOs and `@ResponseSchema(...)` |
| `util/inputSchema.util.ts`                | Merges declared body/query/params Zod schemas into one object for the MCP tool's `inputSchema`                                  |
| `mcp.types.ts`                            | `RegisteredMcpTool`, `InputDeclaration`                                                                                         |

## Testing

`mcpServer.service.live.test.ts` is the canonical integration test and the schema-completeness CI gate in one. It boots the full AppModule via `useTestService()`, POSTs JSON-RPC to `/v1/mcp` with a real axios client, and asserts both `tools/list` and `tools/call` round-trip correctly. If a misconfigured `@McpTool` exists anywhere in the app, this test fails on the first `tools/list` call with a clear list of every violation.

Unit tests in `mcpServer.service.test.ts` use synthetic controller fixtures via `Test.createTestingModule` — fast, exercise the gather/validate/dispatch logic against controlled inputs without spinning up Postgres.

```bash
npx vitest run src/mcp
```

## Known design choices

- **`gatherTools()` runs on every request.** With one opted-in tool the cost is unmeasurable; if tool count grows to dozens, this is where to add caching with proper invalidation (the registry is pure-functional over controller metadata, so the cache key is "until the process restarts").
- **No `@McpTool`-specific OpenAPI surface.** The module's only HTTP entry point is `/v1/mcp` (JSON-RPC). The MCP tool list is discovered via the protocol, not via OpenAPI introspection.
- **Per-route opt-in, not whole-controller.** Decorating a controller would surface routes the dev didn't intend (admin endpoints, internal M2M routes). Opt-in is per-handler so each tool is a deliberate choice.
