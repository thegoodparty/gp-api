import { google } from 'googleapis'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { PrismaClient } from '@prisma/client'

const googleServiceEmail =
  'good-party-service@thegoodparty-1562658240463.iam.gserviceaccount.com'

const { AWS_REGION: region = 'us-west-2' } = process.env

const s3Bucket = 'goodparty-keys'
const s3 = new S3Client({ region })

export default async function seedMtfcc(prisma: PrismaClient) {
  const jwtClient = await authenticateGoogleServiceAccount()
  await jwtClient.authorize()
  const sheets = google.sheets({ version: 'v4', auth: jwtClient })

  const spreadsheetId = '1Ye6wwrGLVQQL32Jjq6BwPcpEhqKwpygrKBm2j_c_fvk'

  console.log('Reading MTFCC mapping from sheet')
  const readResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'mtfcc-mapping',
  })

  const rows = readResponse.data.values

  if (!rows) {
    throw new Error('No rows found in sheet')
  }

  const total = rows.length - 1
  let processedCount = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    await processRow(prisma, row)
    processedCount++
    const percentComplete = ((processedCount / total) * 100).toFixed(0)
    process.stdout.write(
      `\r ${processedCount}/${total} ${percentComplete}% complete`,
    )
  }

  console.log(
    `\nSuccessfully loaded mtfcc mapping, processed ${processedCount} rows`,
  )
}

async function authenticateGoogleServiceAccount() {
  const googleServiceJSON = await readJsonFromS3(
    s3Bucket,
    'google-service-key.json',
  )
  const googleServiceKey = googleServiceJSON.private_key
  // Configure a JWT client with service account
  const jwtClient = new google.auth.JWT(
    googleServiceEmail,
    undefined,
    googleServiceKey,
    ['https://www.googleapis.com/auth/spreadsheets'],
  )
  return jwtClient
}

async function readJsonFromS3(bucketName, keyName) {
  try {
    const params = {
      Bucket: bucketName,
      Key: keyName,
    }
    const getObjectCommand = new GetObjectCommand(params)
    const response = await s3.send(getObjectCommand)
    if (!response.Body) throw new Error('No data received from S3')
    const streamToString = await response.Body.transformToString()
    const jsonContent = JSON.parse(streamToString)
    return jsonContent
  } catch (error) {
    console.error('Error reading JSON from S3:', error)
    throw error
  }
}

async function processRow(prisma: PrismaClient, entity) {
  try {
    if (!entity) {
      return
    }
    const [mtfcc, mtfcc_type, geo_id, name, state] = entity

    await prisma.censusEntity.upsert({
      where: {
        mtfcc_mtfccType_geoId_name_state: {
          mtfcc,
          mtfccType: mtfcc_type,
          geoId: geo_id,
          name,
          state,
        },
      },
      update: {},
      create: {
        mtfcc,
        mtfccType: mtfcc_type,
        geoId: geo_id,
        name,
        state,
      },
    })
  } catch (e) {
    console.error('error processing row : ', entity)
    console.error('error : ', e)
  }
}
