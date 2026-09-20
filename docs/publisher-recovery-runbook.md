# Publisher recovery runbook

Recovery is an authenticated application workflow. Never repair publisher rows directly in the database.

## Preconditions

- `META_PUBLISH_ENV=staging`; `AUTO_PUBLISH` remains governed separately.
- Item remains `scheduled` with `publisher_state=failed`, intact approval attempt, one exact approved asset-set identity.
- Assets live on permanent HTTPS storage under the intended `Content_ID`/revision/slide path. Temporary hosts or signed/expiring query URLs are rejected.
- Recovery performs HTTP 200, image MIME, 1–25 MiB, contiguous count/order, SHA256, revision/candidate/hash gates before Meta.
- Recent linked Meta media blocks retry on ambiguous outcomes. One `retryKey` permits one retry only.

## Authenticated recovery

Call `POST /api/internal/publisher/recover` through the approved internal runner using `INTERNAL_API_TOKEN` in the Authorization header, never command arguments:

```json
{"Content_ID":"ASM-...","retryKey":"incident-unique-id","repairedTargetUrl":"https://permanent-cdn.example/ASM-.../revision/slide-1.png"}
```

`repairedTargetUrl` is optional and scoped to slide 1. Its bytes must retain the approved SHA256. A different revision/hash requires new artifact submission and approval; mutation clears prior approval identity. The endpoint clears only lease/error fields needed for the retry, writes a versioned audit record, and sanitizes persisted errors.

## Scheduler behavior

`POST /api/internal/publisher/poll` returns non-2xx whenever any due item fails. Alert on nonzero runner exit. Logs may contain Content_ID and counts; never tokens, authorization headers, or raw provider payloads.

## UAT

Use stubbed HTTP/Meta responses only. Do not invoke external publishing during UAT. Cover missing URL, wrong MIME/hash/revision, expired URL, retry failure/replay, and ambiguous prior outcome.
