# Telegram authorization

## Identity model

Authorization uses Telegram's numeric user ID, stored as PostgreSQL `BIGINT` with a unique constraint. `telegramUsername` and `displayName` are convenience metadata updated on successful access; neither grants authority. An inbound profile resolves as authorized only when:

1. a `TelegramIdentity` exists for the numeric ID;
2. the identity has no `disabledAt` value;
3. its internal `User` is `ACTIVE`; and
4. the required permission is present through a non-revoked `UserRole`.

Unknown or disabled identities receive a fixed denial message. The application records a sanitized `TELEGRAM_ACCESS_DENIED` audit event and reveals no users, roles, or configuration.

## Phase 1E permission matrix

| Capability | Viewer | Marketing editor | Marketing approver | Admin |
|---|---:|---:|---:|---:|
| Start/help/search | yes | yes | yes | yes |
| Own status/history/source/validation | yes | yes | yes | yes |
| Create/generate | no | yes | yes | yes |
| View all jobs | no | no | no | yes |
| Approve/reject/publish | unavailable | unavailable | unavailable | unavailable |

Permission decisions live in `PermissionService`; handlers do not scatter role-name checks. Non-admin job reads add `requesterUserId = actor.internalUserId`, preventing IDOR even if a valid-looking job identifier is supplied.

## Provisioning and offboarding

Phase 1E does not expose an identity administration endpoint. Operators must create the internal user, assign a seeded role, and bind one numeric Telegram ID through a controlled database/admin procedure. Offboarding sets `TelegramIdentity.disabledAt`, revokes roles, or disables the internal user. Existing action tokens then fail actor resolution before they can be used.

