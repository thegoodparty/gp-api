# Testing Postman Collections Locally

## Recommended Approach: Use Postman Desktop

The easiest way to test Postman collections locally is to use the Postman desktop application:

1. Open Postman
2. Select the appropriate environment (gp-api-dev, gp-api-qa, or localhost)
3. Run individual requests or entire collections
4. View results directly in the UI

## Managing Postman Variables

### Environment Variables (gp-api-dev, gp-api-qa, localhost)

Use for environment-specific values like:

- `baseUrl` or `host`
- `apiKey` for that environment
- Environment-specific credentials

### Global Variables (Workspace-level)

Use for values shared across all environments like:

- `protocol` (http/https)
- `port` (if consistent)
- `rootPath` (/v1, /api, etc.)
- Common headers

To set these in Postman:

1. **Environments**: Environments tab → Select environment → Edit variables
2. **Globals**: Click the Globals button (next to Environments) → Add/edit variables

## Advanced: Running via Newman CLI

If you need to run collections via the command line (e.g., for testing the CI/CD workflow logic), you can reference the implementation in `.github/workflows/main.yml` which shows how to:

1. Fetch collections from Postman workspace using the API
2. Download environment and globals
3. Run Newman with appropriate flags

This approach is automatically executed in the CI/CD pipeline after each deployment.
