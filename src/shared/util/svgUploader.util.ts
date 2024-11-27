import { s3Uploader } from "./s3Uploader.util";

export async function svgUploader(fileName: string, bucketName: string, svgData: string): Promise<string> {
  const assetsBase = process.env.ASSETS_BASE; // Figure this out
  const bucketPath = `${assetsBase}/${bucketName}`;

  await s3Uploader(
    {
      Key: fileName,
      ContentType: 'image/svg+xml',
      CacheControl: 'max-age=31536000',
      Body: svgData,
    },
    bucketPath,
  );

  return `https://${bucketPath}/${fileName}`;
}