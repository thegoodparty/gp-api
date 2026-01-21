#!/bin/sh
set -e

# Validate environment
environment=$1

if [ -z "$environment" ]; then
  echo "Must provide an environment"
  exit 1
fi
if [ "$environment" != "dev" ] && [ "$environment" != "qa" ] && [ "$environment" != "prod" ]; then
  echo "Invalid environment: $environment"
  exit 1
fi

pulumi login s3://goodparty-iac-state
pulumi stack select "organization/gp-api/gp-api-$environment" --create
pulumi config set aws:region us-west-2
pulumi config set environment "$environment"

# if there is a value for CI, just do it
if [ -n "$CI" ]; then
  pulumi up --yes --skip-preview
else
  pulumi up
fi
