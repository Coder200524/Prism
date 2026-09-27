# DOGFOOD Portal REST API Documentation

This document describes the REST API architecture, authentication methods, rate limits, error conventions, versioning policy, and usage examples for the DOGFOOD Hackathon Portal.

The complete interactive API reference is available offline at `/api/docs` (Swagger UI) or via the raw OpenAPI 3.1 specification at `/api/openapi.json`.

---

## 1. Authentication

The API supports two methods of authentication passed in the standard `Authorization` HTTP header:

### A. Session Tokens (User Access)
- Obtained via `POST /api/auth/login`.
- Transmitted as: `Authorization: Bearer <session_token>`
- Grants full permissions associated with the logged-in user's platform and event roles.

### B. API Keys (Machine Access)
- Created by Event Organizers or Admins via `POST /api/events/:eventId/api-keys`.
- Transmitted as: `Authorization: Bearer dfk_<random_bytes>`
- Format: Prefixed with `dfk_` (DOGFOOD Key). The raw key is returned **once** upon creation and stored server-side only as a SHA-256 hash (`keyHash`).
- **Scopes:**
  - `read`: Allows `GET` and `HEAD` requests only.
  - `write`: Allows state-changing operations (`POST`, `PUT`, `PATCH`, `DELETE`).
- **Event Scoping:** An API key can optionally be bound to a specific `eventId`. Requests to resources outside this event will be rejected with `403 event_mismatch`.

---

## 2. Error Conventions

All non-2xx responses follow a standardized JSON error shape:

```json
{
  "error": {
    "code": "error_code_in_snake_case",
    "message": "Human readable explanation of the error.",
    "details": null
  }
}
```

### Common HTTP Status Codes
| Code | Error Code | Description |
|---|---|---|
| `400` | `bad_request` | Invalid JSON body, query parameters, or domain validation failure. |
| `401` | `unauthorized` | Missing, invalid, or expired session token or API key. |
| `403` | `forbidden` / `insufficient_scope` / `event_mismatch` / `submissions_closed` | Logged in but insufficient permissions or restricted by key scopes or phase. |
| `404` | `not_found` | Resource does not exist or is not visible to the caller. |
| `409` | `conflict` | Uniqueness constraint violation (e.g., user role conflict or duplicate vote). |
| `429` | `rate_limited` | Rate limit exceeded. |

---

## 3. Rate Limits

- **Auth Endpoints (`/api/auth/login`, `/api/auth/register`):** 10 requests per minute per IP address.
- **API Keys:** 120 requests per minute per API key. Exceeding this limit yields `429 rate_limited`.

---

## 4. Pagination & Filtering

Endpoints returning lists (such as `/api/projects` or `/api/events/:eventId/audit`) support standard query parameters:
- `limit`: Number of items to return (default: `50`, max: `100`).
- `offset`: Zero-based item offset for offset-based pagination.
- `trackId`: Filter projects or scores by specific track ID.

---

## 5. Versioning & Compatibility Policy

- All API routes are rooted under `/api`.
- The API follows a strict **Additive Versioning Policy**: breaking changes to existing endpoint paths, request bodies, or response fields are never introduced. New features add new endpoints or additive fields.

---

## 6. Curl Examples

### Example 1: Creating an API Key (Organizer)
```bash
curl -X POST http://localhost:8080/api/events/evt_01/api-keys \
  -H "Authorization: Bearer <organizer_session_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI/CD Integration Key",
    "scopes": ["read", "write"]
  }'
```
**Response:**
```json
{
  "id": "cm7xyz...",
  "eventId": "evt_01",
  "ownerId": "usr_org",
  "name": "CI/CD Integration Key",
  "prefix": "dfk_a1b2",
  "scopes": ["read", "write"],
  "key": "dfk_a1b2c3d4e5f6...",
  "createdAt": "2026-09-27T12:00:00.000Z"
}
```

### Example 2: Fetching Public Project Gallery using an API Key
```bash
curl -X GET "http://localhost:8080/api/projects?eventId=evt_01" \
  -H "Authorization: Bearer dfk_a1b2c3d4e5f6..."
```
**Response:**
```json
{
  "projects": [
    {
      "id": "prj_01",
      "eventId": "evt_01",
      "title": "Quantum Portal",
      "summary": "Self-hosted offline hackathon portal",
      "repoUrl": "https://github.com/example/quantum",
      "status": "SUBMITTED"
    }
  ]
}
```

### Example 3: Revoking an API Key
```bash
curl -X DELETE http://localhost:8080/api/api-keys/cm7xyz... \
  -H "Authorization: Bearer <organizer_session_token>"
```
**Response:**
```json
{
  "id": "cm7xyz...",
  "revokedAt": "2026-09-27T12:05:00.000Z"
}
```
