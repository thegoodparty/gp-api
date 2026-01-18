import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'

export interface AssetsRouterConfig {
  environment: 'dev' | 'qa'
  bucketRegionalDomainName: pulumi.Input<string>
  hostedZoneId: string
}

export async function createAssetsRouter({
  environment,
  bucketRegionalDomainName,
  hostedZoneId,
}: AssetsRouterConfig) {
  const select = <T>(values: Record<'dev' | 'qa', T>): T => values[environment]

  const domain = select({
    dev: 'assets-dev.goodparty.org',
    qa: 'assets-qa.goodparty.org',
  })

  const oac = new aws.cloudfront.OriginAccessControl('assetsOac', {
    name: select({
      dev: 'gp-develop-assetsdevelop-ua8uwsm7',
      qa: 'gp-qa-assetsqa-x3vxtdex',
    }),
    description: `Origin Access Control for ${environment}`,
    originAccessControlOriginType: 's3',
    signingBehavior: 'always',
    signingProtocol: 'sigv4',
  })

  const certificateArn = select({
    dev: 'arn:aws:acm:us-east-1:333022194791:certificate/993245c3-7462-45df-9aca-12acc133b9f3',
    qa: 'arn:aws:acm:us-east-1:333022194791:certificate/5ff12552-4ba0-4e77-b6c1-25cdb6a626c2',
  })

  const distribution = new aws.cloudfront.Distribution('assetsDistribution', {
    enabled: true,
    isIpv6Enabled: false,
    comment: `Assets CDN for ${environment}`,
    aliases: [domain],
    priceClass: 'PriceClass_All',
    origins: [
      {
        domainName: bucketRegionalDomainName,
        originId: '/*',
        originAccessControlId: oac?.id,
      },
    ],
    defaultCacheBehavior: {
      cachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
      targetOriginId: '/*',
      viewerProtocolPolicy: 'redirect-to-https',
      allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
      cachedMethods: ['GET', 'HEAD'],
      compress: true,
    },
    viewerCertificate: {
      acmCertificateArn: certificateArn,
      sslSupportMethod: 'sni-only',
      minimumProtocolVersion: 'TLSv1.2_2021',
    },
    restrictions: {
      geoRestriction: {
        restrictionType: 'none',
      },
    },
    waitForDeployment: true,
  })

  new aws.route53.Record('assetsARecord', {
    zoneId: hostedZoneId,
    name: domain,
    type: 'A',
    aliases: [
      {
        name: distribution.domainName,
        zoneId: distribution.hostedZoneId,
        evaluateTargetHealth: true,
      },
    ],
  })

  new aws.route53.Record('assetsAAAARecord', {
    zoneId: hostedZoneId,
    name: domain,
    type: 'AAAA',
    aliases: [
      {
        name: distribution.domainName,
        zoneId: distribution.hostedZoneId,
        evaluateTargetHealth: true,
      },
    ],
  })

  return {
    distribution,
    distributionDomainName: distribution.domainName,
    distributionId: distribution.id,
    url: pulumi.interpolate`https://${domain}`,
  }
}
