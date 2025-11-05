# Postman Tests CI/CD Checklist

## ✅ What's Ready

Your Postman tests are now integrated into the CI/CD pipeline! Here's what's configured:

### Local Testing

- ✅ Script to download and run Postman collections locally
- ✅ Environment variable loading from `.env` file
- ✅ Support for Postman environments (gp-api-dev, gp-api-qa, localhost)
- ✅ Automatic globals fetching
- ✅ HTML and JUnit report generation
- ✅ Handles duplicate environment names (uses most recent)
- ✅ Runs all collections even if some fail

### CI/CD Pipeline

- ✅ Automatically runs on push to `develop`, `qa`, and `master` branches
- ✅ Runs after successful deployment
- ✅ Waits for healthcheck before running tests
- ✅ Downloads collections and environments from Postman workspace
- ✅ Maps branches to environments (develop→dev, qa→qa, master→prod)
- ✅ **Non-blocking** - test failures won't fail the deployment
- ✅ Generates and uploads test reports as artifacts
- ✅ Sends Slack notifications with test results

## 🔧 Required Secrets in GitHub

Make sure these secrets are configured in your GitHub repository:

### Already Configured (from deployment):

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `DEV_HEALTHCHECK_URL`
- `QA_HEALTHCHECK_URL`
- `SLACK_WEBHOOK_URL`

### Need to Add for Postman Tests:

- `POSTMAN_API_KEY` - Your Postman API key
- `POSTMAN_WORKSPACE_ID` - Your Postman workspace ID
- `DEV_API_TOKEN` (optional) - API token for dev environment
- `QA_API_TOKEN` (optional) - API token for qa environment
- `PROD_API_TOKEN` (optional) - API token for prod environment

## 📝 Setup Instructions

### 1. Get Postman API Key

1. Open Postman
2. Go to Settings → API Keys
3. Generate a new API key
4. Copy the key

### 2. Get Workspace ID

1. Open Postman
2. Click on your workspace name
3. Go to Workspace → Info
4. Copy the Workspace ID (or get it from the URL)

### 3. Add Secrets to GitHub

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add:
   - Name: `POSTMAN_API_KEY`, Value: `<your-api-key>`
   - Name: `POSTMAN_WORKSPACE_ID`, Value: `<your-workspace-id>`

### 4. Clean Up Duplicate Environments in Postman (Recommended)

You have 4 environments named `gp-api-dev`. To avoid confusion:

1. Open Postman → Environments
2. Keep the most recently updated one
3. Delete or rename the other 3 duplicates
4. Repeat for `gp-api-qa` if duplicates exist

### 5. Create Production Environment (When Ready)

When you're ready for production tests:

1. In Postman, create a `gp-api-prod` environment
2. Set the same variables as dev/qa with production values

## 🚀 Deployment

Once secrets are added, simply push to your branch:

```bash
git add .
git commit -m "Add Postman test automation"
git push origin develop
```

The workflow will:

1. Deploy your code
2. Wait for the service to be healthy
3. Run all Postman collections
4. Upload reports (downloadable from GitHub Actions artifacts)
5. Send Slack notification with results

## 📊 Viewing Test Results

### In GitHub Actions:

1. Go to your repository → Actions
2. Click on the workflow run
3. Scroll down to "Artifacts"
4. Download `newman-reports-dev` (or qa/prod)
5. Open the HTML files in your browser

### Locally:

After running `./test-postman-local.sh dev`:

```bash
open newman/*.html
```

## 🔄 Making Tests Blocking (Later)

Once you've fixed all the failing tests and want them to block deployments:

1. Remove `continue-on-error: true` from line 83 in `.github/workflows/main.yml`
2. Update Slack notification messages to remove "(Informational)" and "(Non-blocking)"
3. Commit and push

The tests will then fail the workflow if any collection fails.

## 📚 Documentation

- **Local testing guide**: `POSTMAN_TESTING.md`
- **Workflow file**: `.github/workflows/main.yml`
- **Test script**: `test-postman-local.sh`

## ❓ Troubleshooting

If tests fail in CI but work locally:

- Check that environment variables are set correctly in Postman
- Verify the healthcheck URL is correct for that environment
- Check the Newman reports in GitHub artifacts for detailed error messages
- Ensure the deployed API is actually healthy and accessible
