#!/bin/bash
# Discover AWS resource IDs for Pulumi import
# Usage: ./discover-import-ids.sh <stage>
# Where stage is: develop, qa, or master

set -e

STAGE=${1:-develop}
REGION="us-west-2"

echo "=========================================="
echo "Discovering resources for stage: $STAGE"
echo "=========================================="
echo ""

# Map stage to service name pattern
SERVICE_NAME="gp-api-${STAGE}"

# ECS Cluster
echo "=== ECS Cluster ==="
CLUSTER_ARN=$(aws ecs list-clusters --region $REGION --query "clusterArns[?contains(@, 'GpApiCluster') && contains(@, '${STAGE}')]" --output text 2>/dev/null | head -1)
if [ -z "$CLUSTER_ARN" ]; then
  # Try alternative naming
  CLUSTER_ARN=$(aws ecs list-clusters --region $REGION --query "clusterArns[?contains(@, 'gp-api') || contains(@, 'GpApi')]" --output text 2>/dev/null | grep -i "$STAGE" | head -1)
fi
echo "cluster: $CLUSTER_ARN"
CLUSTER_NAME=$(echo $CLUSTER_ARN | sed 's/.*cluster\///')
echo "(cluster name: $CLUSTER_NAME)"
echo ""

# Security Groups
echo "=== Security Groups ==="
echo "Looking for ALB and task security groups..."
aws ec2 describe-security-groups --region $REGION \
  --filters "Name=vpc-id,Values=vpc-0763fa52c32ebcf6a" \
  --query "SecurityGroups[?contains(GroupName, '${SERVICE_NAME}') || contains(GroupName, 'gp-api') && contains(GroupName, '${STAGE}')].{Name:GroupName,Id:GroupId}" \
  --output table
echo ""
echo "Note: You need to identify which is the ALB SG and which is the Task SG"
echo "  - ALB SG typically allows 80/443 from 0.0.0.0/0"
echo "  - Task SG typically allows traffic from the ALB SG"
echo ""

# Load Balancer
echo "=== Load Balancer ==="
ALB_ARN=$(aws elbv2 describe-load-balancers --region $REGION \
  --query "LoadBalancers[?contains(LoadBalancerName, '${SERVICE_NAME}') || contains(LoadBalancerName, 'gp-api')].LoadBalancerArn" \
  --output text 2>/dev/null | grep -i "$STAGE" | head -1)
if [ -z "$ALB_ARN" ]; then
  echo "Could not find ALB. Listing all ALBs:"
  aws elbv2 describe-load-balancers --region $REGION \
    --query "LoadBalancers[].{Name:LoadBalancerName,Arn:LoadBalancerArn}" --output table
else
  echo "loadBalancer: $ALB_ARN"
  echo ""

  # Target Groups
  echo "=== Target Groups ==="
  aws elbv2 describe-target-groups --region $REGION \
    --load-balancer-arn "$ALB_ARN" \
    --query "TargetGroups[].{Name:TargetGroupName,Arn:TargetGroupArn,Port:Port}" \
    --output table
  echo ""

  # Listeners
  echo "=== Listeners ==="
  aws elbv2 describe-listeners --region $REGION \
    --load-balancer-arn "$ALB_ARN" \
    --query "Listeners[].{Port:Port,Protocol:Protocol,Arn:ListenerArn}" \
    --output table
fi
echo ""

# CloudWatch Log Group
echo "=== CloudWatch Log Group ==="
echo "logGroup: /ecs/${SERVICE_NAME}"
aws logs describe-log-groups --region $REGION \
  --log-group-name-prefix "/ecs/${SERVICE_NAME}" \
  --query "logGroups[].logGroupName" --output text
echo ""

# IAM Roles
echo "=== IAM Roles ==="
echo "Looking for execution and task roles..."
aws iam list-roles \
  --query "Roles[?contains(RoleName, '${SERVICE_NAME}') || (contains(RoleName, 'gp-api') && contains(RoleName, '${STAGE}'))].{Name:RoleName,Arn:Arn}" \
  --output table
echo ""
echo "Note: Execution role typically has 'execution' in the name, task role has 'task'"
echo ""

# ECS Service
echo "=== ECS Service ==="
if [ -n "$CLUSTER_NAME" ]; then
  aws ecs describe-services --region $REGION \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME" \
    --query "services[0].{Name:serviceName,Arn:serviceArn,TaskDef:taskDefinition,DesiredCount:desiredCount}" \
    --output table 2>/dev/null || echo "Could not find service $SERVICE_NAME in cluster $CLUSTER_NAME"
fi
echo ""

# Task Definition
echo "=== Task Definition ==="
echo "Looking for task definitions..."
aws ecs list-task-definitions --region $REGION \
  --family-prefix "$CLUSTER_NAME-$SERVICE_NAME" \
  --sort DESC \
  --max-items 1 \
  --query "taskDefinitionArns[0]" --output text 2>/dev/null || \
aws ecs list-task-definitions --region $REGION \
  --family-prefix "$SERVICE_NAME" \
  --sort DESC \
  --max-items 1 \
  --query "taskDefinitionArns[0]" --output text
echo ""

# Auto Scaling
echo "=== Auto Scaling ==="
echo "scalingTarget: service/${CLUSTER_NAME}/${SERVICE_NAME}"
echo ""
echo "Scaling Policies:"
aws application-autoscaling describe-scaling-policies --region $REGION \
  --service-namespace ecs \
  --query "ScalingPolicies[?contains(ResourceId, '${SERVICE_NAME}')].{Name:PolicyName,ResourceId:ResourceId,PolicyType:PolicyType}" \
  --output table
echo ""

# DNS Record
echo "=== DNS Record ==="
HOSTED_ZONE_ID="Z10392302OXMPNQLPO07K"
case $STAGE in
  develop)
    DOMAIN="gp-api-dev.goodparty.org"
    ;;
  qa)
    DOMAIN="gp-api-qa.goodparty.org"
    ;;
  master)
    DOMAIN="gp-api.goodparty.org"
    ;;
esac
echo "dnsRecord: ${HOSTED_ZONE_ID}_${DOMAIN}_A"
echo ""

# ACM Certificates
echo "=== ACM Certificates ==="
aws acm list-certificates --region $REGION \
  --query "CertificateSummaryList[?contains(DomainName, 'goodparty.org')].{Domain:DomainName,Arn:CertificateArn,Status:Status}" \
  --output table
echo ""

echo "=========================================="
echo "Done! Copy the values above into main.ts"
echo "=========================================="
