import * as aws from '@pulumi/aws'

export const createVpc = () => {
  const vpc = new aws.ec2.Vpc(
    'vpc',
    {
      cidrBlock: '10.0.0.0/16',
      enableDnsSupport: true,
      enableDnsHostnames: true,
      tags: { Name: 'gp-master-api VPC' },
    },
    { import: 'vpc-0763fa52c32ebcf6a' },
  )

  const internetGateway = new aws.ec2.InternetGateway(
    'apiInternetGateway',
    {
      vpcId: vpc.id,
      tags: {
        Name: 'gp-master-apiInternetGateway',
      },
    },
    { import: 'igw-022a5412bfab6472e' },
  )

  const securityGroup = new aws.ec2.DefaultSecurityGroup(
    'apiSecurityGroup',
    {
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
    },
    {
      import: 'sg-01de8d67b0f0ec787',
    },
  )

  const publicSubnet1 = new aws.ec2.Subnet(
    'apiPublicSubnet1',
    {
      vpcId: vpc.id,
      cidrBlock: '10.0.0.0/22',
      availabilityZone: 'us-west-2a',
      mapPublicIpOnLaunch: true,
      tags: {
        Name: 'gp-master-apiPublicSubnet1',
      },
    },
    {
      import: 'subnet-07984b965dabfdedc',
    },
  )

  const publicSubnet2 = new aws.ec2.Subnet(
    'apiPublicSubnet2',
    {
      vpcId: vpc.id,
      cidrBlock: '10.0.8.0/22',
      availabilityZone: 'us-west-2b',
      mapPublicIpOnLaunch: true,
      tags: {
        Name: 'gp-master-apiPublicSubnet2',
      },
    },
    {
      import: 'subnet-01c540e6428cdd8db',
    },
  )

  const publicRouteTable1 = new aws.ec2.RouteTable(
    'apiPublicSubnet1RouteTable',
    {
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
    },
    {
      import: 'rtb-08bcd3a5532d855c4',
    },
  )

  const publicRouteTable2 = new aws.ec2.RouteTable(
    'apiPublicSubnet2RouteTable',
    {
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
    },
    {
      import: 'rtb-0a4907d64c04cbcd9',
    },
  )

  new aws.ec2.RouteTableAssociation(
    'apiPublicSubnet1RouteTableAssociation',
    {
      subnetId: publicSubnet1.id,
      routeTableId: publicRouteTable1.id,
    },
    {
      import: 'subnet-07984b965dabfdedc/rtb-08bcd3a5532d855c4',
    },
  )

  new aws.ec2.RouteTableAssociation(
    'apiPublicSubnet2RouteTableAssociation',
    {
      subnetId: publicSubnet2.id,
      routeTableId: publicRouteTable2.id,
    },
    {
      import: 'subnet-01c540e6428cdd8db/rtb-0a4907d64c04cbcd9',
    },
  )

  const eip1 = new aws.ec2.Eip(
    'apiPublicSubnet1Eip',
    {
      domain: 'vpc',
      tags: {
        Name: 'gp-master-apiElasticIp1',
      },
    },
    {
      import: 'eipalloc-0f6b9b9ec4c859ee2',
    },
  )

  const eip2 = new aws.ec2.Eip(
    'apiPublicSubnet2Eip',
    {
      domain: 'vpc',
      tags: {
        Name: 'gp-master-apiElasticIp2',
      },
    },
    {
      import: 'eipalloc-01f4c996d233f4f3a',
    },
  )

  const natGateway1 = new aws.ec2.NatGateway(
    'apiPublicSubnet1NatGateway',
    {
      subnetId: publicSubnet1.id,
      allocationId: eip1.id,
      tags: {
        Name: 'gp-master-apiNatGateway1',
      },
    },
    {
      import: 'nat-0064901dfcc3f2363',
    },
  )

  const natGateway2 = new aws.ec2.NatGateway(
    'apiPublicSubnet2NatGateway',
    {
      subnetId: publicSubnet2.id,
      allocationId: eip2.id,
      tags: {
        Name: 'gp-master-apiNatGateway2',
      },
    },
    {
      import: 'nat-02575978c119cef12',
    },
  )

  const privateSubnet1 = new aws.ec2.Subnet(
    'apiPrivateSubnet1',
    {
      vpcId: vpc.id,
      cidrBlock: '10.0.4.0/22',
      availabilityZone: 'us-west-2a',
      tags: {
        Name: 'gp-master-apiPrivateSubnet1',
      },
    },
    { import: 'subnet-053357b931f0524d4' },
  )

  const privateSubnet2 = new aws.ec2.Subnet(
    'apiPrivateSubnet2',
    {
      vpcId: vpc.id,
      cidrBlock: '10.0.12.0/22',
      availabilityZone: 'us-west-2b',
      tags: {
        Name: 'gp-master-apiPrivateSubnet2',
      },
    },
    {
      import: 'subnet-0bb591861f72dcb7f',
    },
  )

  const privateRouteTable1 = new aws.ec2.RouteTable(
    'apiPrivateSubnet1RouteTable',
    {
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
    },
    {
      import: 'rtb-0709e1dbae02f0215',
    },
  )

  const privateRouteTable2 = new aws.ec2.RouteTable(
    'apiPrivateSubnet2RouteTable',
    {
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
    },
    {
      import: 'rtb-0e77d602e8d981b55',
    },
  )

  new aws.ec2.RouteTableAssociation(
    'apiPrivateSubnet1RouteTableAssociation',
    {
      subnetId: privateSubnet1.id,
      routeTableId: privateRouteTable1.id,
    },
    {
      import: 'subnet-053357b931f0524d4/rtb-0709e1dbae02f0215',
    },
  )

  new aws.ec2.RouteTableAssociation(
    'apiPrivateSubnet2RouteTableAssociation',
    {
      subnetId: privateSubnet2.id,
      routeTableId: privateRouteTable2.id,
    },
    {
      import: 'subnet-0bb591861f72dcb7f/rtb-0e77d602e8d981b55',
    },
  )

  return {
    id: vpc.id,
    cidrBlock: vpc.cidrBlock,
    securityGroupId: securityGroup.id,
    publicSubnetIds: [publicSubnet1.id, publicSubnet2.id],
    privateSubnetIds: [privateSubnet1.id, privateSubnet2.id],
  }
}
