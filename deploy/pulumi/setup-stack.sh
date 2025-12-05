#!/bin/bash
set -e

# Usage: ./setup-stack.sh <stack-name> <environment>
# Example: ./setup-stack.sh gp-api-develop-shadow dev

STACK_NAME=$1
ENV=$2

if [ -z "$STACK_NAME" ] || [ -z "$ENV" ]; then
  echo "Usage: ./setup-stack.sh <stack-name> <environment>"
  echo "Example: ./setup-stack.sh gp-api-develop-shadow dev"
  exit 1
fi

# Default values (can be overridden by env vars)
REGION=${AWS_REGION:-"us-west-2"}
STATE_BUCKET="s3://gp-api-pulumi-state"

echo "Using State Backend: $STATE_BUCKET"

# Check for required PULUMI_CONFIG_PASSPHRASE
if [ -z "$PULUMI_CONFIG_PASSPHRASE" ]; then
  echo "ERROR: PULUMI_CONFIG_PASSPHRASE environment variable is required"
  echo "Generate one with: openssl rand -base64 32"
  exit 1
fi

pulumi login $STATE_BUCKET

echo "Selecting/Creating Stack: $STACK_NAME"
pulumi stack select $STACK_NAME --create || true

echo "Configuring Stack..."
pulumi config set aws:region $REGION

# Infrastructure Values (MUST be set via ENV vars - no defaults for security)
if [ -z "$VPC_ID" ] || [ -z "$PUBLIC_SUBNETS" ] || [ -z "$PRIVATE_SUBNETS" ] || \
   [ -z "$SECURITY_GROUP_ID" ] || [ -z "$CERT_ARN" ]; then
  echo "ERROR: Required infrastructure environment variables not set"
  echo "Please set: VPC_ID, PUBLIC_SUBNETS, PRIVATE_SUBNETS, SECURITY_GROUP_ID, CERT_ARN"
  exit 1
fi

IMAGE_URI=${IMAGE_URI:-"333022194791.dkr.ecr.us-west-2.amazonaws.com/gp-api:latest"}

# Secret ARN for the specific environment
if [ "$ENV" == "dev" ]; then
    SECRET_ARN="arn:aws:secretsmanager:us-west-2:333022194791:secret:GP_API_DEV-ag7Mf4"
elif [ "$ENV" == "prod" ]; then
    SECRET_ARN="arn:aws:secretsmanager:us-west-2:333022194791:secret:GP_API_PROD-kvf2EI" 
elif [ "$ENV" == "qa" ]; then
    SECRET_ARN="arn:aws:secretsmanager:us-west-2:333022194791:secret:GP_API_QA-w290tg"
else
    echo "Unknown environment: $ENV. Supported: dev, qa, prod"
    exit 1
fi

pulumi config set vpcId $VPC_ID
pulumi config set --path publicSubnetIds "$PUBLIC_SUBNETS"
pulumi config set --path privateSubnetIds "$PRIVATE_SUBNETS"
pulumi config set securityGroupId $SECURITY_GROUP_ID
pulumi config set certificateArn $CERT_ARN
pulumi config set imageUri $IMAGE_URI
# Storing ARN as plaintext is fine as it's not the secret value itself
pulumi config set secretArn $SECRET_ARN --plaintext 

# Booleans
if [ "$ENV" == "prod" ]; then
    pulumi config set isProduction true
    pulumi config set isPreview false
else
    pulumi config set isProduction false
    pulumi config set isPreview false
fi

echo "Stack $STACK_NAME configured successfully!"
echo "Run 'pulumi preview' to check the plan."

