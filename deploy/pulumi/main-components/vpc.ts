import * as aws from '@pulumi/aws'

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

  const securityGroup = new aws.ec2.DefaultSecurityGroup('apiSecurityGroup', {
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

  const publicSubnet1 = new aws.ec2.Subnet('apiPublicSubnet1', {
    vpcId: vpc.id,
    cidrBlock: '10.0.0.0/22',
    availabilityZone: 'us-west-2a',
    mapPublicIpOnLaunch: true,
    tags: {
      Name: 'gp-master-apiPublicSubnet1',
    },
  })

  const publicSubnet2 = new aws.ec2.Subnet('apiPublicSubnet2', {
    vpcId: vpc.id,
    cidrBlock: '10.0.8.0/22',
    availabilityZone: 'us-west-2b',
    mapPublicIpOnLaunch: true,
    tags: {
      Name: 'gp-master-apiPublicSubnet2',
    },
  })

  const publicRouteTable1 = new aws.ec2.RouteTable('apiPublicRouteTable1', {
    vpcId: vpc.id,
    routes: [
      {
        cidrBlock: '0.0.0.0/0',
        gatewayId: internetGateway.id,
      },
    ],
    tags: {
      Name: 'gp-master-apiPublicRouteTable1',
    },
  })

  const publicRouteTable2 = new aws.ec2.RouteTable('apiPublicRouteTable2', {
    vpcId: vpc.id,
    routes: [
      {
        cidrBlock: '0.0.0.0/0',
        gatewayId: internetGateway.id,
      },
    ],
    tags: {
      Name: 'gp-master-apiPublicRouteTable2',
    },
  })

  new aws.ec2.RouteTableAssociation('apiPublicRouteTableAssociation1', {
    subnetId: publicSubnet1.id,
    routeTableId: publicRouteTable1.id,
  })

  new aws.ec2.RouteTableAssociation('apiPublicRouteTableAssociation2', {
    subnetId: publicSubnet2.id,
    routeTableId: publicRouteTable2.id,
  })

  const eip1 = new aws.ec2.Eip('apiElasticIp1', {
    domain: 'vpc',
    tags: {
      Name: 'gp-master-apiElasticIp1',
    },
  })

  const eip2 = new aws.ec2.Eip('apiElasticIp2', {
    domain: 'vpc',
    tags: {
      Name: 'gp-master-apiElasticIp2',
    },
  })

  const natGateway1 = new aws.ec2.NatGateway('apiNatGateway1', {
    subnetId: publicSubnet1.id,
    allocationId: eip1.id,
    tags: {
      Name: 'gp-master-apiNatGateway1',
    },
  })

  const natGateway2 = new aws.ec2.NatGateway('apiNatGateway2', {
    subnetId: publicSubnet2.id,
    allocationId: eip2.id,
    tags: {
      Name: 'gp-master-apiNatGateway2',
    },
  })

  const privateSubnet1 = new aws.ec2.Subnet('apiPrivateSubnet1', {
    vpcId: vpc.id,
    cidrBlock: '10.0.4.0/22',
    availabilityZone: 'us-west-2a',
    tags: {
      Name: 'gp-master-apiPrivateSubnet1',
    },
  })

  const privateSubnet2 = new aws.ec2.Subnet('apiPrivateSubnet2', {
    vpcId: vpc.id,
    cidrBlock: '10.0.12.0/22',
    availabilityZone: 'us-west-2b',
    tags: {
      Name: 'gp-master-apiPrivateSubnet2',
    },
  })

  const privateRouteTable1 = new aws.ec2.RouteTable('apiPrivateRouteTable1', {
    vpcId: vpc.id,
    routes: [
      {
        cidrBlock: '0.0.0.0/0',
        natGatewayId: natGateway1.id,
      },
    ],
    tags: {
      Name: 'gp-master-apiPrivateRouteTable1',
    },
  })

  const privateRouteTable2 = new aws.ec2.RouteTable('apiPrivateRouteTable2', {
    vpcId: vpc.id,
    routes: [
      {
        cidrBlock: '0.0.0.0/0',
        natGatewayId: natGateway2.id,
      },
    ],
    tags: {
      Name: 'gp-master-apiPrivateRouteTable2',
    },
  })

  new aws.ec2.RouteTableAssociation('apiPrivateRouteTableAssociation1', {
    subnetId: privateSubnet1.id,
    routeTableId: privateRouteTable1.id,
  })

  new aws.ec2.RouteTableAssociation('apiPrivateRouteTableAssociation2', {
    subnetId: privateSubnet2.id,
    routeTableId: privateRouteTable2.id,
  })

  return {
    id: vpc.id,
    cidrBlock: vpc.cidrBlock,
    securityGroupId: securityGroup.id,
    publicSubnetIds: [publicSubnet1.id, publicSubnet2.id],
    privateSubnetIds: [privateSubnet1.id, privateSubnet2.id],
  }
}
