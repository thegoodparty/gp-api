#!/bin/sh
set -e

# Validate environment
environment=$1

if [ -z "$environment" ]; then
  echo "Must provide an environment"
  exit 1
fi
if [ "$environment" != "preview" ] && [ "$environment" != "dev" ] && [ "$environment" != "qa" ] && [ "$environment" != "prod" ]; then
  echo "Invalid environment: $environment"
  exit 1
fi

if [ "$environment" = "preview" ]; then
  if [ -z "$GITHUB_PR_NUMBER" ]; then
    echo "Must specify a GITHUB_PR_NUMBER environment variable for preview environment"
    exit 1
  fi
  stack="organization/gp-api/gp-api-pr-$GITHUB_PR_NUMBER"
else
  stack="organization/gp-api/gp-api-$environment"
fi

if [ -z "$IMAGE_URI" ]; then
  echo "Must specify an IMAGE_URI environment variable"
  exit 1
fi

AWS_REGION=us-west-2 pulumi login s3://goodparty-iac-state
pulumi stack select "$stack" --create
pulumi config set aws:region us-west-2
pulumi config set environment "$environment"
pulumi config set imageUri "$IMAGE_URI"
if [ "$environment" = "preview" ]; then
  pulumi config set prNumber "$GITHUB_PR_NUMBER"
fi

# Set default tags
pulumi config set --path aws:defaultTags.tags.Environment "$environment"
pulumi config set --path aws:defaultTags.tags.Project "gp-api"

# if there is a value for CI, just do it
if [ -n "$CI" ]; then
  pulumi up --yes --skip-preview
else
  pulumi preview --diff
fi
