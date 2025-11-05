# Testing Postman Collections Locally

This guide explains how to test your Postman collections locally before pushing to CI/CD.

## Prerequisites

1. **Install Newman** (if not already installed):

   ```bash
   npm i -g newman newman-reporter-htmlextra
   ```

2. **Install jq** (for JSON parsing):

   ```bash
   brew install jq
   ```

3. **Create a `.env` file** in the root of `gp-api`:

   ```bash
   POSTMAN_API_KEY=your-postman-api-key
   POSTMAN_WORKSPACE_ID=your-workspace-id
   API_TOKEN=your-api-token-for-dev
   ```

   You can find these values in:
   - Postman API Key: Postman → Settings → API Keys
   - Workspace ID: Postman → Workspace → Info (or from the URL)

   The script will automatically load variables from `.env` (which is gitignored)

## Running Tests

### Quick Test (Development Environment)

```bash
./test-postman-local.sh dev
```

### Test Against Other Environments

```bash
./test-postman-local.sh qa        # Uses gp-api-qa environment
./test-postman-local.sh localhost # Uses localhost environment
```

The script automatically maps environments:

- `dev` → `gp-api-dev`
- `qa` → `gp-api-qa`
- `localhost` → `localhost`

## What the Script Does

1. Fetches all collections from your Postman workspace
2. Maps your environment parameter to the actual Postman environment name
3. Downloads the specified environment (gp-api-dev/gp-api-qa/localhost)
4. Downloads Postman globals if available (for shared variables across environments)
5. Runs all collections using Newman with both environment and globals
6. Generates reports in `newman/` directory:
   - HTML reports (open in browser)
   - JUnit XML reports (for CI integration)

## Managing Postman Variables

The script fetches both environment-specific and global variables from Postman:

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

Both are automatically downloaded and applied when you run the tests.

## Viewing Reports

After running tests, open the HTML reports:

```bash
open newman/*.html
```

## Running Individual Collections

If you want to test a specific collection:

```bash
# First, run the script to download collections
./test-postman-local.sh dev

# Then run a specific collection (with globals if available)
newman run postman/YOUR_COLLECTION_NAME.collection.json \
  -e postman/dev.environment.json \
  -g postman/globals.json \
  --reporters cli,htmlextra \
  --reporter-htmlextra-export newman/test.html
```

## Troubleshooting

### Collections not found

- Verify your `POSTMAN_WORKSPACE_ID` is correct
- Check that your API key has access to the workspace

### Environment not found

- Ensure your Postman environments are named: `gp-api-dev`, `gp-api-qa`, `localhost`
- Check that environments are in the same workspace
- The script will show available environments if the requested one is not found

### Variables not being resolved ({{variable}} errors)

If you see errors like "Invalid protocol: {{protocol}}:" or similar:

1. **Check if variables are in Postman Globals**:
   - Open Postman → Click "Globals" (top right, next to Environments)
   - Add variables like `protocol`, `host`, `port`, `rootPath` there
   - These will be downloaded automatically by the script

2. **Or add to each Environment**:
   - Add the variables to each environment (gp-api-dev, gp-api-qa, localhost)
   - Good for environment-specific values

3. **Re-run the script** after updating variables in Postman

### Tests failing locally but passing in Postman

- Check environment variables are set correctly
- Verify the API endpoint is accessible from your machine
- Ensure any VPN/network requirements are met

## Cleanup

Remove downloaded files:

```bash
rm -rf postman newman
```
