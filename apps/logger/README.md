# Logger

Shared logging package for Superbloom applications. Provides a pre-configured [Pino](https://getpino.io) logger for structured JSON logging.

## Usage

```typescript
import logger from "logger";

logger.info("Server started");
logger.error({ err, userId }, "Failed to process request");
logger.debug({ data }, "Processing data");
```

## Installation

This is a workspace package. Import it directly in other Superbloom apps:

```typescript
// In nexus, the-machine, etc.
import logger from "logger";
```

## Configuration

The logger is pre-configured with:
- **Log level:** `info`
- **Format:** Structured JSON (ideal for production log aggregation)

## Tech Stack

- [Pino](https://getpino.io) - Fast, low-overhead JSON logger
- [Bun](https://bun.sh) runtime
