import { MultipartFile } from '@fastify/multipart'
import { Readable } from 'stream'

export type FileUpload = {
  data: Readable | Buffer
} & Omit<MultipartFile, 'file' | 'toBuffer' | 'type' | 'fields'>

export type GenerateSignedUploadUrlArgs = {
  fileType: string
  fileName: string
  bucket: string
}
