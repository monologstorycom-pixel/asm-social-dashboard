# Scheduled Meta synchronization

## Audit result

The repository previously defined the authenticated `POST /api/internal/meta/import` and `POST /api/internal/meta/sync-due` handlers, but contained no cron, CI workflow, platform scheduler configuration, or external runner that invoked either route. The app process itself must not own the schedule because multiple replicas would duplicate runs.

## Runner

`scripts/meta-sync-runner.mjs` is the smallest external-runner entry point. It uses Node's built-in `fetch`, keeps the bearer token in the process environment rather than command arguments, rejects plaintext remote URLs, times out before the route's 300-second limit, and exits nonzero on HTTP or network failure.

Required runtime environment:

```sh
ASM_SOCIAL_BASE_URL=https://dashboard.example.invalid
INTERNAL_API_TOKEN=<scheduler-only bearer token>
```

Do not commit those values. Supply them through the scheduler's secret/environment store. The application still separately requires its existing database and read-only Meta settings.

Manual invocation:

```sh
node scripts/meta-sync-runner.mjs import
node scripts/meta-sync-runner.mjs sync-due
```

Recommended external schedules (WIB):

```cron
# Import recent media hourly at minute 7.
7 * * * * cd /opt/asm-social-dashboard && /usr/bin/node scripts/meta-sync-runner.mjs import
# Check due H+1/H+6/H+24/H+72/D+7 windows every 10 minutes.
*/10 * * * * cd /opt/asm-social-dashboard && /usr/bin/node scripts/meta-sync-runner.mjs sync-due
```

The scheduler must inject `ASM_SOCIAL_BASE_URL` and `INTERNAL_API_TOKEN`; do not place secrets directly in the crontab. Use the equivalent two recurring jobs if the deployment platform provides scheduled tasks. Prevent overlapping runs in the scheduler, retain stdout/stderr, alert on nonzero exit, and run only one scheduler instance.

## Safe local verification

Syntax and guard checks do not contact the application or Meta:

```sh
node --check scripts/meta-sync-runner.mjs
node scripts/meta-sync-runner.mjs sync-due  # expected exit 2 without env
ASM_SOCIAL_BASE_URL=http://example.com INTERNAL_API_TOKEN=fake \
  node scripts/meta-sync-runner.mjs sync-due  # expected exit 2; remote plaintext rejected
```

For end-to-end runner verification, target a local mock server with a fake token. Do not run either command against production during validation. Before enabling a real schedule, verify one non-production invocation returns HTTP 2xx, then verify scheduler logs and database snapshots without exposing tokens.
