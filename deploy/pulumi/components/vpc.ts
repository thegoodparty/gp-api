import {
  ComponentResource,
  ComponentResourceOptions,
  Output,
} from "@pulumi/pulumi";
import {
  ec2,
  getAvailabilityZonesOutput,
} from "@pulumi/aws";

export interface VpcArgs {
  azs: number
}

export class Vpc extends ComponentResource {
  private vpc: ec2.Vpc;
  private _publicSubnets: Output<ec2.Subnet[]>;
  private _privateSubnets: Output<ec2.Subnet[]>;

  constructor(
    name: string,
    args: VpcArgs,
    opts?: ComponentResourceOptions,
  ) {
    super("gp:vpc:Vpc", name, {}, opts);
    const self = this;

    const zones = getAvailabilityZonesOutput(
      { state: "available" },
      { parent: self },
    ).apply(zones => zones.names.slice(0, args.azs))

    const vpc = new ec2.Vpc(
      `${name}Vpc`,
      {
        cidrBlock: "10.0.0.0/16",
        enableDnsSupport: true,
        enableDnsHostnames: true,
        tags: {
          Name: `gp-master-api VPC`,
        },
      },
      { parent: self },
    )
    const internetGateway = new ec2.InternetGateway(
      `${name}InternetGateway`,
      { vpcId: vpc.id },
      { parent: self },
    )

    new ec2.DefaultSecurityGroup(
      `${name}SecurityGroup`,
      {
        vpcId: vpc.id,
        egress: [
          {
            fromPort: 0,
            toPort: 0,
            protocol: "-1",
            cidrBlocks: ["0.0.0.0/0"],
          },
        ],
        ingress: [
          {
            fromPort: 0,
            toPort: 0,
            protocol: "-1",
            // Restricts inbound traffic to only within the VPC
            cidrBlocks: [vpc.cidrBlock],
          },
        ],
      },
      { parent: self },
    )
    const publicSubnets = createPublicSubnets();
    const elasticIps = publicSubnets.apply(subnets => subnets.map(
      (_, i) =>
        new ec2.Eip(
          `${name}ElasticIp${i + 1}`,
          { vpc: true },
          { parent: self },
        ),
    ))
    const natGateways = publicSubnets.apply(subnets => subnets.map(
      (subnet, i) =>
        new ec2.NatGateway(
          `${name}NatGateway${i + 1}`,
          {
            subnetId: subnet.id,
            allocationId: elasticIps[i].id
          },
          { parent: self },
        ),
    ))
    const privateSubnets = createPrivateSubnets();

    this.vpc = vpc;
    this._publicSubnets = publicSubnets;
    this._privateSubnets = privateSubnets;

    function createPublicSubnets() {
      return zones.apply((zones) =>
        zones.map((zone, i) => {
          const subnet = new ec2.Subnet(
            `${name}PublicSubnet${i + 1}`,
            {
              vpcId: vpc.id,
              cidrBlock: `10.0.${8 * i}.0/22`,
              availabilityZone: zone,
              mapPublicIpOnLaunch: true,
            },
          );

          const routeTable = new ec2.RouteTable(
            `${name}PublicRouteTable${i + 1}`,
            {
              vpcId: vpc.id,
              routes: [
                {
                  cidrBlock: "0.0.0.0/0",
                  gatewayId: internetGateway.id,
                },
              ],
            },
            { parent: self },
          );

          new ec2.RouteTableAssociation(
            `${name}PublicRouteTableAssociation${i + 1}`,
            {
              subnetId: subnet.id,
              routeTableId: routeTable.id,
            },
            { parent: self },
          );

          return subnet
        }),
      );
    }

    function createPrivateSubnets() {
      return zones.apply((zones) =>
        zones.map((zone, i) => {
          const subnet = new ec2.Subnet(
            `${name}PrivateSubnet${i + 1}`,
            {
              vpcId: vpc.id,
              cidrBlock: `10.0.${8 * i + 4}.0/22`,
              availabilityZone: zone,
            },
            { parent: self },
          );

          const routeTable = new ec2.RouteTable(
            `${name}PrivateRouteTable${i + 1}`,
            {
              vpcId: vpc.id,
              routes: natGateways.apply(
                (natGateways) => [
                  {
                    cidrBlock: "0.0.0.0/0",
                    natGatewayId: natGateways[i].id,
                  },
                ],
              ),
            },
            { parent: self },
          );

          new ec2.RouteTableAssociation(
            `${name}PrivateRouteTableAssociation${i + 1}`,
            {
              subnetId: subnet.id,
              routeTableId: routeTable.id,
            },
            { parent: self },
          );

          return subnet
        }),
      );
    }
  }

  public get id() {
    return this.vpc.id;
  }

  public get publicSubnets() {
    return this._publicSubnets.apply((subnets) =>
      subnets.map((subnet) => subnet.id),
    );
  }

  public get privateSubnets() {
    return this._privateSubnets.apply((subnets) =>
      subnets.map((subnet) => subnet.id),
    );
  }
}
