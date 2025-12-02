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
# Note: PULUMI_CONFIG_PASSPHRASE should be set in your shell or CI env for security.
# We default to empty here for non-interactive usage if not set.
export PULUMI_CONFIG_PASSPHRASE=${PULUMI_CONFIG_PASSPHRASE:-""}
pulumi login $STATE_BUCKET

echo "Selecting/Creating Stack: $STACK_NAME"
pulumi stack select $STACK_NAME --create || true

echo "Configuring Stack..."
pulumi config set aws:region $REGION

# Default Infrastructure Values (Modify these or pass as ENV vars)
VPC_ID=${VPC_ID:-"vpc-0763fa52c32ebcf6a"}
PUBLIC_SUBNETS=${PUBLIC_SUBNETS:-'["subnet-REPLACE-ME-1", "subnet-REPLACE-ME-2"]'}
SECURITY_GROUP_ID=${SECURITY_GROUP_ID:-"sg-REPLACE-ME-ALB"}
CERT_ARN=${CERT_ARN:-"arn:aws:acm:us-west-2:333022194791:certificate/REPLACE-ME"}
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

