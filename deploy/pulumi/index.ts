import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { Compute } from './components/compute';
import { Database } from './components/database';
import { Queue } from './components/queue';
import { Monitoring } from './components/monitoring';

const config = new pulumi.Config();
const stackName = pulumi.getStack();

// 1. Infrastructure Config
const vpcId = config.require('vpcId');
const publicSubnetIds = config.requireObject<string[]>('publicSubnetIds');
const securityGroupId = config.require('securityGroupId');
const certificateArn = config.require('certificateArn');
const imageUri = config.require('imageUri');

// 2. Secrets Config
const secretArn = config.require('secretArn');
const isPreview = config.getBoolean('isPreview') || false;
const isProduction = config.getBoolean('isProduction') || false;

// 3. Preview Environment Config (optional)
const previewCertificateArn = config.get('previewCertificateArn');
const previewHostedZoneId = config.get('previewHostedZoneId');
const previewDomain = config.get('previewDomain') || 'preview.goodparty.org';

// 4. Test Credentials (for preview seeding)
const adminEmail = config.get('adminEmail');
const adminPassword = config.getSecret('adminPassword');
const candidateEmail = config.get('candidateEmail');
const candidatePassword = config.getSecret('candidatePassword');

let stageName = 'dev';
let prNumber: string | undefined;

if (isPreview) {
    const parts = stackName.split('-');
    if (stackName.includes('pr-')) {
        prNumber = parts[parts.length - 1];
        stageName = `pr-${prNumber}`;
    }
} else if (isProduction) {
    stageName = 'prod';
} else {
    stageName = 'dev';
}

const baseTags = {
    Project: 'gp-api',
    ManagedBy: 'pulumi',
    Stack: stackName,
};

const queue = new Queue(`${stackName}-queue`, {
    isPreview,
    prNumber,
    namePrefix: stageName,
    tags: baseTags,
});

// Fetch and Parse Secret
const secretVersion = aws.secretsmanager.getSecretVersionOutput({ secretId: secretArn });
const secretData = secretVersion.secretString.apply(s => {
    const parsed = JSON.parse(s || '{}');
    delete parsed.AWS_ACCESS_KEY_ID;
    delete parsed.AWS_SECRET_ACCESS_KEY;
    delete parsed.AWS_S3_KEY;
    delete parsed.AWS_S3_SECRET;
    return parsed as Record<string, string>;
});

// 4. Database Logic
let databaseUrl: pulumi.Output<string>;
let dbDependency: pulumi.Resource | undefined;

if (isPreview) {
    const db = new Database(`${stackName}-db`, {
        vpcId,
        subnetIds: publicSubnetIds,
        securityGroupId,
        isPreview: true,
        prNumber,
        tags: baseTags,
    });
    databaseUrl = db.url;
    dbDependency = db.instance;
} else {
    databaseUrl = secretData.apply(s => s.DATABASE_URL);
}

// 6. Prepare Environment Variables
const finalEnvVars = pulumi.all([
    secretData, 
    databaseUrl, 
    queue.queueName, 
    queue.queueUrl,
    adminEmail || '',
    adminPassword || pulumi.output(''),
    candidateEmail || '',
    candidatePassword || pulumi.output(''),
]).apply(([data, dbUrl, qName, qUrl, aEmail, aPass, cEmail, cPass]) => {
    const baseEnv: Record<string, string> = {
    ...data,
    DATABASE_URL: dbUrl,
    NODE_ENV: 'production',
        IS_PREVIEW: isPreview ? 'true' : 'false',
    SQS_QUEUE: qName,
    SQS_QUEUE_BASE_URL: qUrl.replace(`/${qName}`, ''),
    PORT: '80',
    HOST: '0.0.0.0',
    };

    if (isPreview && aEmail && aPass && cEmail && cPass) {
        baseEnv.ADMIN_EMAIL = aEmail;
        baseEnv.ADMIN_PASSWORD = aPass;
        baseEnv.CANDIDATE_EMAIL = cEmail;
        baseEnv.CANDIDATE_PASSWORD = cPass;
    }

    return baseEnv;
});

const computeDeps = dbDependency ? { dependsOn: [dbDependency] } : undefined;
const effectiveCertArn = isPreview && previewCertificateArn ? previewCertificateArn : certificateArn;

const compute = new Compute(`${stackName}-compute`, {
    vpcId,
    publicSubnetIds,
    securityGroupId,
    imageUri,
    isProduction,
    isPreview,
    prNumber,
    certificateArn: effectiveCertArn,
    environment: finalEnvVars,
    tags: baseTags,
    hostedZoneId: previewHostedZoneId,
    previewDomain,
}, computeDeps);

new Monitoring(`${stackName}-monitoring`, {
    serviceName: compute.serviceName,
    loadBalancerArnSuffix: compute.loadBalancerArnSuffix,
    targetGroupArnSuffix: compute.targetGroupArnSuffix,
    clusterName: compute.clusterArn.apply(arn => arn.split('/').pop() || ''),
});

export const serviceUrl = compute.url;
