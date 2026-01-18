import * as aws from '@pulumi/aws'
import { Output } from '@pulumi/pulumi'

const AZs = ['us-west-2a', 'us-west-2b']

const createSubnet = (params: {
  vpcId: Output<string>
  name: string
  gateway: Pick<
    aws.types.input.ec2.RouteTableRoute,
    'gatewayId' | 'natGatewayId'
  >
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
        ...params.gateway,
        cidrBlock: '0.0.0.0/0',
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

  return { id: subnet.id }
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
    const publicSubnet = createSubnet({
      name: `apiPublicSubnet${idx + 1}`,
      availabilityZone: azName,
      cidrBlock: `10.0.${idx * 4}.0/22`,
      vpcId: vpc.id,
      public: true,
      gateway: {
        gatewayId: internetGateway.id,
      },
    })

    const eip = new aws.ec2.Eip(`apiPublicSubnet${idx + 1}Eip`, {
      domain: 'vpc',
      tags: {
        Name: `gp-master-apiPublicSubnet${idx + 1}ElasticIp`,
      },
    })

    const natGateway = new aws.ec2.NatGateway(
      `apiPublicSubnet${idx + 1}NatGateway`,
      {
        subnetId: publicSubnet.id,
        allocationId: eip.id,
        tags: {
          Name: `gp-master-apiPublicSubnet${idx + 1}NatGateway`,
        },
      },
    )

    createSubnet({
      name: `apiPrivateSubnet${idx + 1}`,
      availabilityZone: azName,
      cidrBlock: `10.0.${(idx + 1) * 4}.0/22`,
      vpcId: vpc.id,
      public: false,
      gateway: {
        natGatewayId: natGateway.id,
      },
    })
  }
}
