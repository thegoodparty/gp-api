# Cloudflare Setup for Hybrid Domain Registration

This project now uses a hybrid approach for domain registration:

- **AWS Route53** for domain purchase and registration
- **Cloudflare** for DNS management and domain masking

## Required Environment Variables

Add the following variables to your `.env` file:

### Cloudflare Configuration

```bash
# Option 1: Use API Token (Recommended)
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here

# Option 2: Use Global API Key (Legacy - not recommended)
# CLOUDFLARE_API_EMAIL=your-email@example.com
# CLOUDFLARE_API_KEY=your_cloudflare_global_api_key_here

# Cloudflare Account ID (Required)
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id_here
```

### AWS Route53 Configuration (Existing)

```bash
# These should already be configured
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
```

## Getting Cloudflare Credentials

### 1. Get Cloudflare API Token (Recommended)

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to "My Profile" > "API Tokens"
3. Click "Create Token"
4. Use the "Custom token" template
5. Configure the token with these permissions:
   - **Zone:Zone:Edit** - for creating zones
   - **Zone:DNS:Edit** - for managing DNS records
   - **Zone:Page Rules:Edit** - for domain masking (if needed)
6. Set the zone resources to "Include All zones" or specific zones
7. Copy the generated token to `CLOUDFLARE_API_TOKEN`

### 2. Get Cloudflare Account ID

1. In your Cloudflare Dashboard
2. Select any domain (or the overview page)
3. In the right sidebar, you'll see "Account ID"
4. Copy this to `CLOUDFLARE_ACCOUNT_ID`

## How It Works

1. **Domain Registration**: Route53 handles the actual domain purchase
2. **Zone Creation**: After successful registration, a Cloudflare zone is automatically created
3. **DNS Management**: All DNS records are managed through Cloudflare
4. **Domain Masking**: Cloudflare's page rules enable powerful domain masking/redirection

## New API Endpoints

The hybrid approach adds these new capabilities to the domains service:

- `createDomainMasking(websiteId, redirectUrl, statusCode)` - Set up domain redirection
- `listDNSRecords(websiteId)` - List all DNS records for a domain
- Enhanced `configureDomain(websiteId)` - Returns both Cloudflare and Vercel configuration

## Benefits

- **Cost-effective domain registration** through Route53
- **Advanced DNS features** through Cloudflare
- **Better performance** with Cloudflare's global CDN
- **Easy domain masking** for redirects
- **Robust DNS management** with Cloudflare's API

## Troubleshooting

If you encounter issues:

1. **Zone creation fails**: Check your `CLOUDFLARE_ACCOUNT_ID` is correct
2. **API errors**: Verify your API token has the correct permissions
3. **DNS propagation**: DNS changes can take up to 24 hours to propagate globally
4. **Integration issues**: Check that both AWS and Cloudflare credentials are properly configured
