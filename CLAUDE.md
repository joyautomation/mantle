# CLAUDE.md - Mantle

## Project Overview

Mantle is a Sparkplug B data consumer and logger. It connects to MQTT brokers, subscribes to Sparkplug B messages, and stores metric history in TimescaleDB (PostgreSQL). It exposes a GraphQL API for querying real-time and historical data.

## Tech Stack

- **Runtime**: Deno
- **Database**: PostgreSQL/TimescaleDB with Drizzle ORM
- **Cache**: Redis (optional)
- **Protocol**: Sparkplug B over MQTT
- **API**: GraphQL (Pothos + graphql-yoga)

## Key Commands

```bash
# Development
deno task dev              # Start with watch mode and inspector

# Database
deno task db:generate      # Generate Drizzle migrations

# Testing
deno test -A               # Run all tests
```

## Project Structure

```
├── main.ts               # Application entry point
├── synapse.ts            # GraphQL schema for Sparkplug data
├── history.ts            # History recording and queries
├── hidden.ts             # Hide/unhide functionality
├── redis.ts              # Redis cache operations
├── pubsub.ts             # GraphQL subscriptions
├── log.ts                # Logging configuration
├── db/
│   ├── db.ts             # Database connection
│   └── schema.ts         # Drizzle schema definitions
└── drizzle/              # Database migrations
```

## Release Workflow

Branch protection requires changes through PRs. The release process is:

### 1. Create Feature Branch and PR
```bash
git checkout -b feature/my-feature
# Make changes...
git add <files>
git commit -m "Description of changes"
git push -u origin feature/my-feature
gh pr create --title "My feature" --body "Description"
```

### 2. Version Bump
Update version in `deno.json` before or as part of your changes.

### 3. Tag and Push (triggers Docker build)
```bash
git checkout feature/my-feature
git tag X.Y.Z                    # No 'v' prefix!
git push origin X.Y.Z
```

This triggers `register.yml` which:
- Builds Docker image
- Pushes to DigitalOcean Container Registry
- Pushes to Docker Hub (`joyautomation/mantle:X.Y.Z`)

### 4. Merge PR
```bash
gh pr merge <PR_NUMBER> --merge --delete-branch
```

### 5. (Optional) Create GitHub Release
Creating a release on GitHub triggers `release.yml` which compiles a standalone Deno binary.

## GraphQL API

### Queries
- `groups(includeHidden: Boolean)` - Get Sparkplug hierarchy
- `history(...)` - Query metric history
- `usage` - Get usage statistics

### Mutations
- `hideNode/unhideNode` - Hide/show nodes
- `hideDevice/unhideDevice` - Hide/show devices
- `hideMetric/unhideMetric` - Hide/show metrics
- `deleteNode/deleteDevice/deleteMetric` - Permanently delete from memory, Redis, and database

### Subscriptions
- `metricUpdate` - Real-time metric updates

## Environment Variables

- `MANTLE_MQTT_URL` - MQTT broker URL
- `MANTLE_HOST_ID` - Sparkplug host ID
- `MANTLE_GROUP_ID` - Sparkplug group ID filter
- `MANTLE_REDIS_URL` - Redis connection URL
- `DATABASE_URL` - PostgreSQL connection string
