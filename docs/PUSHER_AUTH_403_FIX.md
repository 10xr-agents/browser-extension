# POST /api/pusher/auth 403 — Fix Guide

This doc helps fix **403 Forbidden** from `POST /api/pusher/auth` when the Chrome extension subscribes to Sockudo private channels. The extension sends **Authorization: Bearer &lt;token&gt;** and form body **socket_id**, **channel_name**; the backend must resolve the user and verify they own the session.

---

## Why 403 happens in your route

Your route returns **403** in three places:

1. **Channel format** — `!channelName.startsWith("private-session-")`
2. **Empty sessionId** — `!sessionId` after slicing the prefix
3. **Session ownership** — `!doc || doc.userId !== session.userId` (DB lookup)

If the client sends `channel_name=private-session-<uuid>`, (1) and (2) are unlikely. So the usual cause is **(3)**: the `Session` lookup fails or `doc.userId` does not match the authenticated user.

---

## Likely causes for the DB 403

- **Session not found:** `findOne({ sessionId, tenantId: session.tenantId })` returns no document.
  - **Field names:** Your Session model might use a different field for the session id (e.g. `id` or `_id` instead of `sessionId`). Confirm the schema uses `sessionId` and `tenantId` as in the query.
  - **tenantId mismatch:** `getSessionForPusherAuth` returns `tenantId` as either the active **organization id** or **userId**. When the session was created (e.g. from the extension or web app), it must have been stored with the **same** tenantId. If the extension creates sessions with `tenantId = userId` but auth returns `tenantId = organizationId` (or the opposite), the query won’t find the doc.
- **User mismatch:** Document exists but `doc.userId !== session.userId`.
  - Session might be stored with a different user identifier (e.g. another field than `userId`), or the session was created by another user in the same org and your rule is “only session owner can subscribe” — then the logic is correct and you just need to ensure the doc’s owner is the same as `session.userId`.

---

## Checklist

1. **Bearer token is read**
   - The extension sends **exactly** `Authorization: Bearer <accessToken>` (from `chrome.storage.local.accessToken`).
   - `getSessionFromRequest(req.headers)` must read `req.headers.get("Authorization")`, strip the `"Bearer "` prefix, and validate the token (JWT or session lookup). If it only reads cookies, extension requests will get no user and you’d see **401**, not 403. So if you see 403, Bearer is likely working; still confirm that `getSessionFromRequest(req.headers)` uses the Authorization header.

2. **Session model matches the query**
   - Query: `Session.findOne({ sessionId, tenantId: session.tenantId }).select("userId")`.
   - Confirm the Session collection has:
     - A field equal to the channel’s session id (e.g. `sessionId` if you use `channel_name = "private-session-<sessionId>"`).
     - A `tenantId` field that matches what `getSessionForPusherAuth` returns (org id or user id).
     - A `userId` field for the owner so you can do `doc.userId === session.userId`.

3. **tenantId consistency**
   - When a session is **created** (e.g. from the extension or web app), what `tenantId` is written? It must match what `getSessionForPusherAuth` returns for that user (e.g. same org id or same user id). Otherwise `findOne` will not find the document.

4. **CORS**
   - For `POST /api/pusher/auth` from the extension origin, the server must allow that origin and allow the `Authorization` header (and method `POST`). Otherwise you’d typically get 401 or CORS errors, but it’s good to confirm.

---

## Suggested route changes

Below is an updated version of your route that:

- Keeps your auth and Session logic.
- Adds **optional** JSON 403 bodies in development so you can see which check failed (`CHANNEL_FORBIDDEN`, `SESSION_NOT_FOUND`, `USER_MISMATCH`).
- Uses a small helper so 403 responses are consistent and easy to log.

Copy or adapt into your Next.js app (e.g. `app/api/pusher/auth/route.ts`).

```ts
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/db/mongoose"
import { Session } from "@/lib/models"
import { auth } from "@/lib/auth"
import { getSessionFromRequest } from "@/lib/auth/session"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"
import { getPusher } from "@/lib/pusher/server"

const CHANNEL_PREFIX = "private-session-"
const isDev = process.env.NODE_ENV === "development"

function forbidden(code: string, message?: string) {
  const body = isDev ? { code, message: message ?? code } : undefined
  return NextResponse.json(body ?? "Forbidden", { status: 403 })
}

/**
 * Resolve session from Bearer token or cookie.
 * Extension sends Authorization: Bearer <token>; getSessionFromRequest must read req.headers.
 */
async function getSessionForPusherAuth(
  req: NextRequest
): Promise<{ userId: string; tenantId: string } | null> {
  const fromBearer = await getSessionFromRequest(req.headers)
  if (fromBearer) return fromBearer
  const fromCookie = await auth.api.getSession({ headers: await headers() })
  if (!fromCookie?.user?.id) return null
  const userId = fromCookie.user.id
  const tenantState = await getTenantState(userId)
  const tenantId =
    tenantState === "organization"
      ? (await getActiveOrganizationId()) ?? userId
      : userId
  return { userId, tenantId }
}

/**
 * POST /api/pusher/auth
 *
 * Sockudo/Pusher channel auth. Client sends form: socket_id, channel_name.
 * Extension sends Authorization: Bearer <token> in headers.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionForPusherAuth(req)
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const formData = await req.formData()
    const socketId = formData.get("socket_id") as string | null
    const channelName = formData.get("channel_name") as string | null

    if (!socketId || !channelName) {
      return new NextResponse("Bad Request", { status: 400 })
    }

    if (!channelName.startsWith(CHANNEL_PREFIX)) {
      return forbidden("CHANNEL_FORBIDDEN", "Channel must be private-session-<sessionId>")
    }

    const sessionId = channelName.slice(CHANNEL_PREFIX.length)
    if (!sessionId) {
      return forbidden("CHANNEL_FORBIDDEN", "Empty sessionId in channel name")
    }

    await connectDB()
    const doc = await (Session as any)
      .findOne({ sessionId, tenantId: session.tenantId })
      .select("userId")
      .lean()
      .exec()

    if (!doc) {
      return forbidden(
        "SESSION_NOT_FOUND",
        `No session for sessionId=${sessionId} and tenantId=${session.tenantId}. Check Session schema and tenantId consistency.`
      )
    }

    if (doc.userId !== session.userId) {
      return forbidden(
        "USER_MISMATCH",
        `Session owned by different user (doc.userId=${doc.userId}, auth userId=${session.userId})`
      )
    }

    const pusher = getPusher()
    if (!pusher) {
      return new NextResponse("Service Unavailable", { status: 503 })
    }

    const authResponse = pusher.authorizeChannel(socketId, channelName)
    return NextResponse.json(authResponse)
  } catch (error: unknown) {
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
```

- In **development**, a 403 response body will look like `{ "code": "SESSION_NOT_FOUND", "message": "..." }` or `USER_MISMATCH` / `CHANNEL_FORBIDDEN`, so you can see which branch failed.
- Fix the underlying issue (Session schema, tenantId when creating sessions, or ownership rule); then you can remove or shorten the dev-only messages.

---

## Quick debug

1. Temporarily add the suggested route and trigger auth from the extension.
2. If 403 body is `SESSION_NOT_FOUND`: check Session field names (`sessionId`, `tenantId`) and that sessions are created with the same `tenantId` that `getSessionForPusherAuth` returns.
3. If 403 body is `USER_MISMATCH`: confirm how Session stores the owner (`userId`) and that it matches the authenticated user from the Bearer token.
4. Ensure `getSessionFromRequest(req.headers)` actually uses `Authorization: Bearer <token>` (e.g. log or assert in dev).

After fixing, real-time sync should work and the extension will stop falling back to polling for that session.
