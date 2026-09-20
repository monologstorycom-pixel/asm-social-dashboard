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
node scripts/meta-sync-runner.mjs import       # incremental: one recent page only
node scripts/meta-sync-runner.mjs sync-due
META_HISTORY_MAX_PAGES=10 node scripts/meta-sync-runner.mjs history

# Historical backfill is a separate authenticated, bounded operation. Each run
# processes 1-100 pages (default 10), commits in safe page transactions, and
# persists its cursor after each successful page. Run it in non-production
# first; reruns resume from meta_sync_checkpoints. A null checkpoint plus
# coverage.complete=true means exhausted. "Near real time" means the hourly
# incremental import schedule below; it is not webhook/instant delivery.
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

## Permanent asset storage contract

Artifact binaries stay outside the database. Staff must upload them to the
persistent volume/object store served at `ASSET_PUBLIC_BASE_URL` before artifact
submission. Configure an HTTPS base such as `https://dashboard.example.invalid/media`
and mount the backing directory as a persistent runtime volume; container-local
ephemeral storage is not supported. URLs must use the exact configured origin and
path `/media/<Content_ID>/<revision>/<candidate>/<slide>.<ext>`. Query strings,
fragments, alternate hosts, and extra path segments are rejected. The public
server/proxy must serve those files without authentication so Meta can fetch them.
