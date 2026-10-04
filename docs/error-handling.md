# Error-handling conventions

## Stable application errors

Project-owned errors carry a stable code and safe public message:

| Error | Code | HTTP status |
|---|---|---:|
| `ValidationError` | `VALIDATION_ERROR` | 400 |
| `NotFoundError` | `NOT_FOUND` | 404 |
| `UnauthorizedError` | `UNAUTHORIZED` | 401 |
| `ForbiddenError` | `FORBIDDEN` | 403 |
| `ConflictError` | `CONFLICT` | 409 |
| `ExternalServiceError` | `EXTERNAL_SERVICE_ERROR` | 502 |
| `InfrastructureError` | `INFRASTRUCTURE_ERROR` | 503 |

Unexpected errors return 500 with `INTERNAL_ERROR`. Known Nest HTTP errors map to a stable `HTTP_<status>` form; request validation uses `HTTP_VALIDATION_ERROR` until application DTO error details are deliberately designed.

## HTTP response

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "The operation conflicts with current state",
    "requestId": "example-request-id"
  }
}
```

Production responses never contain stack traces, SQL/provider details, URLs with credentials, tokens, raw exception objects, or internal hostnames. A caller-visible message must be authored for that audience rather than copied from an external service.

## Logs and worker failures

Errors retain `cause` internally for structured logs. Serialization includes standard error name/message/stack and ignores arbitrary attached secret-bearing properties. Logging recursively redacts sensitive key names. Worker failures record job/execution IDs, safe error class/code, attempt, provider/service label, and duration where available; payloads, credentials, and raw prompts are excluded.

Retry decisions use typed error classification, not message-string matching. `ExternalServiceError` is not automatically transient: adapters must identify timeout, rate limit, selected 5xx, schema, or permanent policy failures explicitly.
