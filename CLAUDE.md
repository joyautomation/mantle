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

### 3. Merge PR
```bash
gh pr merge <PR_NUMBER> --squash --delete-branch
```

### 4. Sync local main
```bash
git checkout main && git pull origin main
```

### 5. Create and push tag (triggers container build)
```bash
git tag 0.0.60
git push origin 0.0.60
```

**IMPORTANT**:
- Do NOT use `v` prefix (use `0.0.60` not `v0.0.60`)
- This triggers `register.yml` which builds and pushes the Docker image to DigitalOcean and Docker Hub

## GraphQL API

### Queries
- `groups(includeHidden: Boolean)` - Get Sparkplug hierarchy
- `hiddenItems` - Get list of hidden nodes, devices, and metrics
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
