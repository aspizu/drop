import S3mini from "s3mini"

export function makeS3(env: {
  S3_ACCESS_KEY_ID: string
  S3_SECRET_ACCESS_KEY: string
  S3_ENDPOINT: string
  S3_REGION: string
}) {
  return new S3mini({
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
  })
}
