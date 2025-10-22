# Logging System

This application uses Winston for structured JSON logging with full support for variadic parameters and automatic request ID tracking.

## Features

- ✅ JSON logging (structured logs in production, pretty-printed in development)
- ✅ NestJS Logger interface compatibility
- ✅ Request/response logging for all HTTP requests
- ✅ Automatic request ID tracking on every log message
- ✅ Automatic user ID extraction from JWT tokens
- ✅ Variadic parameters support (like `console.log`)

## Usage

### In Controllers and Services

Initialize the logger in your constructor and set the context:

```typescript
import { Injectable } from '@nestjs/common'
import { CustomWinstonLogger } from 'src/logging/winston-logger.service'
import { RequestContextService } from 'src/logging/request-context.service'

@Injectable()
export class MyService {
  private readonly logger: CustomWinstonLogger

  constructor(private readonly requestContextService: RequestContextService) {
    this.logger = new CustomWinstonLogger(this.requestContextService)
    this.logger.setContext('MyService')
  }

  async processOrder(userId: string, orderId: string, amount: number) {
    // Simple string logging
    this.logger.log('Processing order')

    // Variadic parameters (like console.log!)
    this.logger.log(
      'User',
      userId,
      'placed order',
      orderId,
      'for amount',
      amount,
    )

    // With additional metadata as objects
    this.logger.log('Order processed', { orderId, amount, currency: 'USD' })

    // Multiple strings and objects combined
    this.logger.warn('High order volume detected', {
      ordersPerMinute: 150,
      userId,
    })

    try {
      // ... process payment
    } catch (error) {
      // Error logging with stack traces
      this.logger.error('Failed to process payment', {
        error: error.message,
        orderId,
        userId,
      })
    }
  }
}
```

### Log Levels

- `log()` - Informational messages
- `error()` - Error messages
- `warn()` - Warning messages
- `debug()` - Debug messages (only in development)
- `verbose()` - Verbose messages

### Automatic Context

Every log message automatically includes:

- `requestId` - Unique ID for the current HTTP request (if in request context)
- `userId` - ID of the authenticated user (if present)
- `context` - The logger context (e.g., service name)
- `timestamp` - ISO timestamp

### HTTP Request/Response Logs

The `HttpLoggingMiddleware` automatically logs all HTTP requests and responses:

**Request Log:**

```json
{
  "level": "info",
  "message": "HTTP request received",
  "method": "GET",
  "url": "/v1/users/123",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user_123",
  "userAgent": "Mozilla/5.0...",
  "origin": "https://example.com",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**Response Log:**

```json
{
  "level": "info",
  "message": "HTTP response sent",
  "method": "GET",
  "url": "/v1/users/123",
  "statusCode": "200",
  "responseTimeMs": "45",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user_123",
  "timestamp": "2024-01-01T12:00:00.045Z"
}
```

### Request Context

The `RequestContextService` uses Node's `AsyncLocalStorage` to track request context automatically. You don't need to manually pass request IDs around - they're automatically included in all log messages within the same request context.

## Configuration

Set the `LOG_LEVEL` environment variable to control log verbosity:

- `error` - Only errors
- `warn` - Warnings and errors
- `info` - Info, warnings, and errors (default)
- `debug` - Everything including debug messages
- `verbose` - Maximum verbosity

## Migration from Pino

The new logger supports variadic parameters, which Pino doesn't:

```typescript
// Old (Pino style)
this.logger.log({ userId, action }, 'User performed action')

// New (supports both styles!)
this.logger.log('User performed action', { userId, action })
// OR use variadic like console.log:
this.logger.log('User', userId, 'performed', action)
```

Both styles work, giving you maximum flexibility!
