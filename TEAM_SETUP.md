# Team Development Setup

## Required Node.js Version

This project requires **Node.js 22.12.0** to ensure consistency between local development and Docker production environments.

## Setup Instructions

### 1. Install Node Version Manager (if not already installed)

**macOS/Linux:**

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload your shell
source ~/.bashrc  # or ~/.zshrc
```

**Windows:**

```bash
# Install nvm-windows from: https://github.com/coreybutler/nvm-windows
```

### 2. Use Correct Node Version

```bash
# Navigate to project directory
cd gp-api

# Install and use the specified Node version
nvm install 22.12.0
nvm use 22.12.0

# Verify versions
node --version  # Should show: v22.12.0
npm --version   # Should show: 10.9.0 (or higher)
```

### 3. Install Dependencies

```bash
# Install project dependencies (using legacy peer deps to resolve conflicts)
npm install --legacy-peer-deps

# For subsequent installs, use:
npm ci --legacy-peer-deps

# This resolves peer dependency conflicts that modern npm can't handle
```

### 4. IDE Configuration

**VS Code:**
Add to your `.vscode/settings.json`:

```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "eslint.workingDirectories": ["./"],
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Environment Consistency

### ✅ Local Development

- Node.js: **22.12.0** (enforced by `.nvmrc`)
- npm: **10.9.0+** (enforced by `package.json` engines)
- Dependencies: **Locked by `package-lock.json`**

### ✅ Docker Production

- Node.js: **22.12.0-alpine** (specified in `Dockerfile`)
- npm: **Same as local** (same base image)
- Dependencies: **Same `package-lock.json`**

## Troubleshooting

### Issue: "Node version mismatch"

```bash
# Solution: Use the correct Node version
nvm use 22.12.0
```

### Issue: "npm ci fails in Docker"

```bash
# This usually means package-lock.json was generated with wrong Node version or peer dependency conflicts
# Solution: Regenerate with correct version and legacy peer deps
nvm use 22.12.0
rm package-lock.json
npm install --legacy-peer-deps
```

### Issue: "Different dependency versions between developers"

```bash
# Solution: Use npm ci instead of npm install
npm ci --legacy-peer-deps  # Uses exact versions from package-lock.json
```

## Important Notes

- **Always use `npm ci` in production/CI** (it's faster and more reliable)
- **Use `npm install` only when adding/updating dependencies**
- **Never commit `node_modules/`** (it's in `.gitignore`)
- **Always commit `package-lock.json`** (ensures identical dependencies)
- **Check Node version before working**: `nvm use` in project directory

## Team Workflow

1. **Pull latest code**: `git pull`
2. **Check Node version**: `nvm use` (uses `.nvmrc`)
3. **Install dependencies**: `npm ci --legacy-peer-deps` (fast, exact versions)
4. **Start development**: `npm run start:dev`

This ensures everyone on the team has **identical environments** locally and in production! 🎯
