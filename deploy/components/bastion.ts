import * as aws from '@pulumi/aws'

// TODO: Replace hardcoded VPN IP with proper cross-stack reference once gpvpn is migrated off SST
// The VPN Elastic IP should be exported from gpvpn and imported here via StackReference
const VPN_ELASTIC_IP = '44.245.62.103'

interface BastionConfig {
  vpcId: string
}

/**
 * Creates IAM and Security Group resources for the bastion host.
 *
 * After deploying:
 * 1. Attach the instance profile to the bastion EC2:
 *    EC2 → Instances → Select bastion → Actions → Security → Modify IAM role
 * 2. Update the bastion's security groups to use the new IaC-managed SG:
 *    EC2 → Instances → Select bastion → Actions → Security → Change security groups
 * 3. Once SSM is working, you can remove the old manually-created bastion SG
 */
export function createBastionResources({ vpcId }: BastionConfig) {
  // Security group for the bastion - SSH restricted to VPN only
  const bastionSecurityGroup = new aws.ec2.SecurityGroup('bastion-sg', {
    name: 'gp-bastion',
    description: 'Bastion host security group - SSH via VPN only',
    vpcId,
    ingress: [
      {
        protocol: 'tcp',
        fromPort: 22,
        toPort: 22,
        cidrBlocks: [`${VPN_ELASTIC_IP}/32`],
        description: 'SSH from VPN only',
      },
    ],
    egress: [
      {
        protocol: '-1',
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ['0.0.0.0/0'],
        description: 'Allow all outbound',
      },
    ],
    tags: {
      Name: 'gp-bastion',
    },
  })

  // IAM role that the bastion EC2 instance will assume
  const bastionRole = new aws.iam.Role('bastion-role', {
    name: 'gp-bastion-role',
    description: 'IAM role for bastion host with SSM access',
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: 'ec2.amazonaws.com',
    }),
    tags: {
      Name: 'gp-bastion-role',
      Purpose: 'SSM Session Manager access for bastion',
    },
  })

  // Attach the AWS managed policy for SSM Session Manager
  new aws.iam.RolePolicyAttachment('bastion-ssm-policy', {
    role: bastionRole.name,
    policyArn: 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore',
  })

  // Instance profile to attach to the EC2 instance
  const bastionInstanceProfile = new aws.iam.InstanceProfile(
    'bastion-instance-profile',
    {
      name: 'gp-bastion-instance-profile',
      role: bastionRole.name,
      tags: {
        Name: 'gp-bastion-instance-profile',
      },
    },
  )

  return {
    securityGroup: bastionSecurityGroup,
    role: bastionRole,
    instanceProfile: bastionInstanceProfile,
  }
}
