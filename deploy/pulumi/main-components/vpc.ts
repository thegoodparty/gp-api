import * as aws from '@pulumi/aws'
import { Output } from '@pulumi/pulumi'

const AZs = ['us-west-2a', 'us-west-2b']

const subnet = (params: {
  vpcId: Output<string>
  internetGatewayId: Output<string>
  name: string
  availabilityZone: string
  cidrBlock: string
  public: boolean
}) => {
  const subnet = new aws.ec2.Subnet(params.name, {
    vpcId: params.vpcId,
    cidrBlock: params.cidrBlock,
    availabilityZone: params.availabilityZone,
    mapPublicIpOnLaunch: params.public,
    tags: {
      Name: `gp-master-${params.name}`,
    },
  })

  const routeTable = new aws.ec2.RouteTable(`${params.name}RouteTable`, {
    vpcId: params.vpcId,
    routes: [
      {
        cidrBlock: '0.0.0.0/0',
        gatewayId: params.internetGatewayId,
      },
    ],
    tags: {
      Name: `gp-master-${params.name}RouteTable`,
    },
  })

  new aws.ec2.RouteTableAssociation(`${params.name}RouteTableAssociation`, {
    subnetId: subnet.id,
    routeTableId: routeTable.id,
  })

  if (params.public) {
    const eip = new aws.ec2.Eip(`${params.name}Eip`, {
      domain: 'vpc',
      tags: {
        Name: `gp-master-${params.name}ElasticIp`,
      },
    })

    new aws.ec2.NatGateway(`${params.name}NatGateway`, {
      subnetId: subnet.id,
      allocationId: eip.id,
      tags: {
        Name: `gp-master-${params.name}NatGateway`,
      },
    })
  }

  return { id: subnet.id, public: params.public }
}

export const createVpc = () => {
  const vpc = new aws.ec2.Vpc('vpc', {
    cidrBlock: '10.0.0.0/16',
    enableDnsSupport: true,
    enableDnsHostnames: true,
    tags: { Name: 'gp-master-api VPC' },
  })

  const internetGateway = new aws.ec2.InternetGateway('apiInternetGateway', {
    vpcId: vpc.id,
    tags: {
      Name: 'gp-master-apiInternetGateway',
    },
  })

  new aws.ec2.DefaultSecurityGroup('apiSecurityGroup', {
    vpcId: vpc.id,
    egress: [
      {
        fromPort: 0,
        toPort: 0,
        protocol: '-1',
        cidrBlocks: ['0.0.0.0/0'],
      },
    ],
    ingress: [
      {
        fromPort: 0,
        toPort: 0,
        protocol: '-1',
        cidrBlocks: [vpc.cidrBlock],
      },
    ],
    tags: {
      Name: 'gp-master-apiSecurityGroup',
    },
  })

  for (const [idx, azName] of AZs.entries()) {
    subnet({
      name: `apiPublicSubnet${idx + 1}`,
      availabilityZone: azName,
      cidrBlock: `10.0.${idx * 4}.0/22`,
      vpcId: vpc.id,
      internetGatewayId: internetGateway.id,
      public: true,
    })
    subnet({
      name: `apiPrivateSubnet${idx + 1}`,
      availabilityZone: azName,
      cidrBlock: `10.0.${(idx + 1) * 4}.0/22`,
      vpcId: vpc.id,
      internetGatewayId: internetGateway.id,
      public: false,
    })
  }
}
