import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'

export interface NewRelicLogForwarderConfig {
  environment: 'preview' | 'dev' | 'qa' | 'prod'
  secretArn: pulumi.Input<string>
  secretKey: string
  logGroupName: pulumi.Input<string>
  logGroupArn: pulumi.Input<string>
  serviceName: string
}

const LAMBDA_CODE = `
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const zlib = require('zlib');

const NR_ENDPOINT = 'https://log-api.newrelic.com/log/v1';
let cachedLicenseKey = null;

const getLicenseKey = async () => {
  if (cachedLicenseKey) return cachedLicenseKey;

  const secretArn = process.env.SECRET_ARN;
  const secretKey = process.env.SECRET_KEY;
  if (!secretArn || !secretKey) throw new Error('SECRET_ARN and SECRET_KEY must be set');

  const client = new SecretsManagerClient();
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secretData = JSON.parse(response.SecretString);
  cachedLicenseKey = secretData[secretKey];
  if (!cachedLicenseKey) throw new Error('Key ' + secretKey + ' not found in secret');
  return cachedLicenseKey;
};

exports.handler = async (event) => {
  let licenseKey;
  try {
    licenseKey = await getLicenseKey();
  } catch (e) {
    console.error('Failed to get license key:', e);
    return { statusCode: 500, body: 'Failed to get license key' };
  }

  const payload = event.awslogs?.data;
  if (!payload) return { statusCode: 200, body: 'No data' };

  const compressed = Buffer.from(payload, 'base64');
  const data = JSON.parse(zlib.gunzipSync(compressed).toString());

  const { logGroup, logStream, logEvents } = data;
  if (!logEvents?.length) return { statusCode: 200, body: 'No log events' };

  const serviceName = process.env.SERVICE_NAME || 'GP_API';

  const nrLogs = logEvents.map((e) => ({
    timestamp: e.timestamp,
    message: e.message,
    attributes: {
      'aws.logGroup': logGroup,
      'aws.logStream': logStream,
      'service.name': serviceName,
      'entity.name': serviceName,
      'entity.type': 'SERVICE',
    },
  }));

  try {
    const response = await fetch(NR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Api-Key': licenseKey },
      body: JSON.stringify(nrLogs),
    });
    console.log('Sent', nrLogs.length, 'logs to New Relic:', response.status);
    return { statusCode: 200, body: 'Sent ' + nrLogs.length + ' logs' };
  } catch (e) {
    console.error('Error sending to New Relic:', e);
    return { statusCode: 500, body: e.message };
  }
};
`

export const createNewRelicLogForwarder = ({
  environment,
  secretArn,
  secretKey,
  logGroupName,
  logGroupArn,
  serviceName,
}: NewRelicLogForwarderConfig): void => {
  const lambdaRole = new aws.iam.Role('newrelicLogForwarderRole', {
    name: `newrelic-log-forwarder-role-${environment}`,
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'lambda.amazonaws.com',
          },
        },
      ],
    }),
    managedPolicyArns: [
      'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    ],
    inlinePolicies: [
      {
        name: 'secrets-access',
        policy: pulumi.jsonStringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['secretsmanager:GetSecretValue'],
              Resource: [secretArn],
            },
          ],
        }),
      },
    ],
  })

  const lambdaFunction = new aws.lambda.Function('newrelicLogForwarder', {
    name: `newrelic-log-forwarder-${environment}`,
    role: lambdaRole.arn,
    runtime: 'nodejs22.x',
    handler: 'index.handler',
    timeout: 30,
    memorySize: 128,
    environment: {
      variables: {
        SECRET_ARN: secretArn,
        SECRET_KEY: secretKey,
        SERVICE_NAME: serviceName,
      },
    },
    code: new pulumi.asset.AssetArchive({
      'index.js': new pulumi.asset.StringAsset(LAMBDA_CODE),
    }),
  })

  const lambdaPermission = new aws.lambda.Permission(
    'newrelicLogForwarderPermission',
    {
      action: 'lambda:InvokeFunction',
      function: lambdaFunction.arn,
      principal: 'logs.us-west-2.amazonaws.com',
      sourceArn: pulumi.interpolate`${logGroupArn}:*`,
    },
  )

  new aws.cloudwatch.LogSubscriptionFilter(
    'newrelicLogSubscriptionFilter',
    {
      name: `newrelic-log-forwarder-${environment}`,
      logGroup: logGroupName,
      filterPattern: '',
      destinationArn: lambdaFunction.arn,
    },
    { dependsOn: [lambdaPermission] },
  )
}
