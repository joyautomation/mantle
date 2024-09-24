# Mantle

Mantle is a MQTT Sparkplug B data aggregator and historian.

## Configuration

Mantle can be configured using cli arguments or by environment variables. CLI
arguments take precedence over environment variables.

### Options

Get a list of options and environment variables:

```
mantle --help
```

## Prerequisites

You'll need a PostgreSQL database with the timescaledb extension installed.
Please see the the [timescaledb docs](https://docs.timescale.com/) for more
information.