import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common'
import { ServiceException } from '@smithy/smithy-client'
import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { S3Service } from './s3.service'

const { mockSend, mockUploadDone, mockGetSignedUrl } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockUploadDone: vi.fn(),
  mockGetSignedUrl: vi.fn(),
}))

vi.mock('@aws-sdk/client-s3', async () => {
  const actual = await vi.importActual('@aws-sdk/client-s3')
  return {
    ...actual,
    S3Client: class MockS3Client {
      send
      constructor() {
        this.send = mockSend
      }
    },
    GetObjectCommand: vi.fn(),
    PutObjectCommand: vi.fn(),
    NoSuchKey: class MockNoSuchKey extends Error {
      name = 'NoSuchKey'
      constructor() {
        super('The specified key does not exist')
      }
    },
  }
})

vi.mock('@aws-sdk/lib-storage', () => {
  class MockUpload {
    done = mockUploadDone
  }
  return {
    Upload: vi.fn(function Upload() {
      return new MockUpload()
    }) as unknown as typeof MockUpload,
  }
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}))

vi.mock('slugify', () => ({
  default: vi.fn((str: string) => str.toLowerCase().replace(/\s+/g, '-')),
}))

describe('S3Service', () => {
  let service: S3Service
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.AWS_REGION = 'us-west-2'
    service = new S3Service()

    const mockLogger = createMockLogger()
    Object.defineProperty(service, 'logger', {
      get: () => mockLogger,
      configurable: true,
    })

    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('buildKey', () => {
    it('returns folder path with trailing slash when only folderPath is provided', () => {
      expect(service.buildKey('folder')).toBe('folder/')
      expect(service.buildKey('folder/')).toBe('folder/')
    })

    it('slugifies fileName by default when only fileName is provided', () => {
      expect(service.buildKey(undefined, 'My File Name.txt')).toBe(
        'my-file-name.txt',
      )
    })

    it('slugifies fileName by default when combined with folderPath', () => {
      expect(service.buildKey('folder', 'My File Name.txt')).toBe(
        'folder/my-file-name.txt',
      )
    })

    it('preserves fileName when slugifyFileName is false and only fileName is provided', () => {
      expect(
        service.buildKey(undefined, 'My File Name.txt', {
          slugifyFileName: false,
        }),
      ).toBe('My File Name.txt')
    })

    it('preserves fileName when slugifyFileName is false and combined with folderPath', () => {
      expect(
        service.buildKey('folder', 'My File Name.txt', {
          slugifyFileName: false,
        }),
      ).toBe('folder/My File Name.txt')
    })

    it('normalizes folder path by adding trailing slash when combining with fileName', () => {
      expect(service.buildKey('folder', 'file.txt')).toBe('folder/file.txt')
      expect(service.buildKey('folder/', 'file.txt')).toBe('folder/file.txt')
    })

    it('slugifies special characters in fileName by default', () => {
      expect(service.buildKey('folder', 'File (1).txt')).toBe(
        'folder/file-(1).txt',
      )
    })
  })

  describe('getSignedUrlForUpload', () => {
    const bucket = 'test-bucket'
    const key = 'folder/file.txt'

    it('generates signed URL with default expiration', async () => {
      const mockUrl = 'https://signed-url.com/upload'
      mockGetSignedUrl.mockResolvedValue(mockUrl)

      const result = await service.getSignedUrlForUpload(bucket, key)

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: bucket,
        Key: key,
        ContentType: undefined,
      })
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.any(PutObjectCommand),
        { expiresIn: 3600 },
      )
      expect(result).toBe(mockUrl)
    })

    it('generates signed URL with custom expiration and contentType', async () => {
      const mockUrl = 'https://signed-url.com/upload'
      mockGetSignedUrl.mockResolvedValue(mockUrl)

      const result = await service.getSignedUrlForUpload(bucket, key, {
        expiresIn: 7200,
        contentType: 'image/png',
      })

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: bucket,
        Key: key,
        ContentType: 'image/png',
      })
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.any(PutObjectCommand),
        { expiresIn: 7200 },
      )
      expect(result).toBe(mockUrl)
    })

    it('throws BadGatewayException on AWS service errors', async () => {
      const awsError = new ServiceException({
        name: 'InternalServerError',
        message: 'AWS service error',
        $fault: 'server',
        $metadata: {},
      })
      mockGetSignedUrl.mockRejectedValue(awsError)

      await expect(service.getSignedUrlForUpload(bucket, key)).rejects.toThrow(
        BadGatewayException,
      )
    })
  })

  describe('getSignedUrlForViewing', () => {
    const bucket = 'test-bucket'
    const key = 'folder/file.txt'

    it('generates signed URL with default expiration', async () => {
      const mockUrl = 'https://signed-url.com/view'
      mockGetSignedUrl.mockResolvedValue(mockUrl)

      const result = await service.getSignedUrlForViewing(bucket, key)

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: bucket,
        Key: key,
      })
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.any(GetObjectCommand),
        { expiresIn: 3600 },
      )
      expect(result).toBe(mockUrl)
    })

    it('generates signed URL with custom expiration', async () => {
      const mockUrl = 'https://signed-url.com/view'
      mockGetSignedUrl.mockResolvedValue(mockUrl)

      const result = await service.getSignedUrlForViewing(bucket, key, {
        expiresIn: 1800,
      })

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.any(GetObjectCommand),
        { expiresIn: 1800 },
      )
      expect(result).toBe(mockUrl)
    })

    it('throws BadGatewayException on AWS service errors', async () => {
      const awsError = new ServiceException({
        name: 'InternalServerError',
        message: 'AWS service error',
        $fault: 'server',
        $metadata: {},
      })
      mockGetSignedUrl.mockRejectedValue(awsError)

      await expect(service.getSignedUrlForViewing(bucket, key)).rejects.toThrow(
        BadGatewayException,
      )
    })
  })

  describe('uploadFile', () => {
    const mockFileBody = Buffer.from('test content')
    const bucket = 'test-bucket'
    const key = 'folder/file.txt'

    it('uploads file and returns URL with default S3 format', async () => {
      const mockResponse = { Key: key }
      mockUploadDone.mockResolvedValue(mockResponse)

      const result = await service.uploadFile(bucket, mockFileBody, key)

      expect(Upload).toHaveBeenCalledWith({
        client: expect.any(S3Client),
        params: {
          Bucket: bucket,
          Key: key,
          Body: mockFileBody,
          ContentType: undefined,
          CacheControl: undefined,
          Metadata: undefined,
        },
      })
      expect(result).toBe(`https://${bucket}.s3.us-west-2.amazonaws.com/${key}`)
    })

    it('uses baseUrl when provided', async () => {
      const mockResponse = { Key: key }
      mockUploadDone.mockResolvedValue(mockResponse)

      const result = await service.uploadFile(bucket, mockFileBody, key, {
        baseUrl: 'https://cdn.example.com',
      })

      expect(result).toBe('https://cdn.example.com/folder/file.txt')
    })

    it('normalizes baseUrl by removing trailing slash', async () => {
      const mockResponse = { Key: key }
      mockUploadDone.mockResolvedValue(mockResponse)

      const result = await service.uploadFile(bucket, mockFileBody, key, {
        baseUrl: 'https://cdn.example.com/',
      })

      expect(result).toBe('https://cdn.example.com/folder/file.txt')
    })

    it('uploads file with contentType, cacheControl, and metadata', async () => {
      const mockResponse = { Key: key }
      mockUploadDone.mockResolvedValue(mockResponse)

      const result = await service.uploadFile(bucket, mockFileBody, key, {
        contentType: 'image/png',
        cacheControl: 'max-age=3600',
        metadata: { author: 'test' },
      })

      expect(Upload).toHaveBeenCalledWith({
        client: expect.any(S3Client),
        params: {
          Bucket: bucket,
          Key: key,
          Body: mockFileBody,
          ContentType: 'image/png',
          CacheControl: 'max-age=3600',
          Metadata: { author: 'test' },
        },
      })
      expect(result).toContain(bucket)
    })

    it('throws BadGatewayException on AWS service errors', async () => {
      const awsError = new ServiceException({
        name: 'InternalServerError',
        message: 'AWS service error',
        $fault: 'server',
        $metadata: {},
      })
      mockUploadDone.mockRejectedValue(awsError)

      await expect(
        service.uploadFile(bucket, mockFileBody, key),
      ).rejects.toThrow(BadGatewayException)
    })

    it('throws BadRequestException on AWS validation errors', async () => {
      const awsError = new ServiceException({
        name: 'InvalidParameter',
        message: 'Invalid parameter',
        $fault: 'client',
        $metadata: {},
      })
      mockUploadDone.mockRejectedValue(awsError)

      await expect(
        service.uploadFile(bucket, mockFileBody, key),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('getFile', () => {
    const bucket = 'test-bucket'
    const key = 'folder/file.txt'

    it('returns file content as string', async () => {
      const mockContent = 'file content'
      const mockResponse = {
        Body: {
          transformToString: vi.fn().mockResolvedValue(mockContent),
        },
      }
      mockSend.mockResolvedValue(mockResponse)

      const result = await service.getFile(bucket, key)

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: bucket,
        Key: key,
      })
      expect(mockSend).toHaveBeenCalledWith(expect.any(GetObjectCommand))
      expect(result).toBe(mockContent)
    })

    it('returns undefined when file does not exist (NoSuchKey)', async () => {
      const noSuchKeyError = new NoSuchKey({
        message: 'The specified key does not exist',
        $metadata: {},
      })
      mockSend.mockRejectedValue(noSuchKeyError)

      const result = await service.getFile(bucket, key)

      expect(result).toBeUndefined()
    })

    it('throws other errors when file retrieval fails', async () => {
      const otherError = new Error('Network error')
      mockSend.mockRejectedValue(otherError)

      await expect(service.getFile(bucket, key)).rejects.toThrow(
        'Network error',
      )
    })

    it('throws BadGatewayException on AWS service errors', async () => {
      const awsError = new ServiceException({
        name: 'InternalServerError',
        message: 'AWS service error',
        $fault: 'server',
        $metadata: {},
      })
      mockSend.mockRejectedValue(awsError)

      await expect(service.getFile(bucket, key)).rejects.toThrow(
        BadGatewayException,
      )
    })

    it('handles missing Body in response', async () => {
      const mockResponse = {
        Body: undefined,
      }
      mockSend.mockResolvedValue(mockResponse)

      const result = await service.getFile(bucket, key)

      expect(result).toBeUndefined()
    })
  })

  describe('getFileUrl', () => {
    const bucket = 'test-bucket'
    const key = 'folder/file.txt'

    it('returns default S3 URL format', () => {
      const result = service.getFileUrl(bucket, key)

      expect(result).toBe(`https://${bucket}.s3.us-west-2.amazonaws.com/${key}`)
    })

    it('uses baseUrl when provided', () => {
      const result = service.getFileUrl(bucket, key, {
        baseUrl: 'https://cdn.example.com',
      })

      expect(result).toBe('https://cdn.example.com/folder/file.txt')
    })

    it('normalizes baseUrl by removing trailing slash', () => {
      const result = service.getFileUrl(bucket, key, {
        baseUrl: 'https://cdn.example.com/',
      })

      expect(result).toBe('https://cdn.example.com/folder/file.txt')
    })
  })

  describe('bucket support', () => {
    const key = 'folder/file.txt'
    const mockFileBody = Buffer.from('test content')

    it('uploadFile works with different bucket names', async () => {
      const buckets = ['bucket1', 'my-bucket', 'assets.example.com']
      const mockResponse = { Key: key }

      for (const bucket of buckets) {
        mockUploadDone.mockResolvedValue(mockResponse)

        const result = await service.uploadFile(bucket, mockFileBody, key)

        expect(Upload).toHaveBeenCalledWith({
          client: expect.any(S3Client),
          params: {
            Bucket: bucket,
            Key: key,
            Body: mockFileBody,
            ContentType: undefined,
            CacheControl: undefined,
            Metadata: undefined,
          },
        })
        expect(result).toBe(
          `https://${bucket}.s3.us-west-2.amazonaws.com/${key}`,
        )
        vi.clearAllMocks()
      }
    })

    it('getSignedUrlForUpload works with different bucket names', async () => {
      const buckets = ['bucket1', 'my-bucket', 'assets.example.com']
      const mockUrl = 'https://signed-url.com/upload'

      for (const bucket of buckets) {
        mockGetSignedUrl.mockResolvedValue(mockUrl)

        await service.getSignedUrlForUpload(bucket, key)

        expect(PutObjectCommand).toHaveBeenCalledWith({
          Bucket: bucket,
          Key: key,
          ContentType: undefined,
        })
        vi.clearAllMocks()
      }
    })

    it('getSignedUrlForViewing works with different bucket names', async () => {
      const buckets = ['bucket1', 'my-bucket', 'assets.example.com']
      const mockUrl = 'https://signed-url.com/view'

      for (const bucket of buckets) {
        mockGetSignedUrl.mockResolvedValue(mockUrl)

        await service.getSignedUrlForViewing(bucket, key)

        expect(GetObjectCommand).toHaveBeenCalledWith({
          Bucket: bucket,
          Key: key,
        })
        vi.clearAllMocks()
      }
    })

    it('getFile works with different bucket names', async () => {
      const buckets = ['bucket1', 'my-bucket', 'assets.example.com']
      const mockContent = 'file content'
      const mockResponse = {
        Body: {
          transformToString: vi.fn().mockResolvedValue(mockContent),
        },
      }

      for (const bucket of buckets) {
        mockSend.mockResolvedValue(mockResponse)

        const result = await service.getFile(bucket, key)

        expect(GetObjectCommand).toHaveBeenCalledWith({
          Bucket: bucket,
          Key: key,
        })
        expect(result).toBe(mockContent)
        vi.clearAllMocks()
      }
    })

    it('getFileUrl generates correct URLs for different bucket names', () => {
      const buckets = ['bucket1', 'my-bucket', 'assets.example.com']

      for (const bucket of buckets) {
        const result = service.getFileUrl(bucket, key)

        expect(result).toBe(
          `https://${bucket}.s3.us-west-2.amazonaws.com/${key}`,
        )
      }
    })

    it('getFileUrl uses baseUrl correctly with different bucket names', () => {
      const buckets = ['bucket1', 'my-bucket', 'assets.example.com']
      const baseUrl = 'https://cdn.example.com'

      for (const bucket of buckets) {
        const result = service.getFileUrl(bucket, key, { baseUrl })

        expect(result).toBe(`${baseUrl}/${key}`)
      }
    })
  })

  describe('error handling from AwsService', () => {
    const bucket = 'test-bucket'
    const key = 'folder/file.txt'
    const mockFileBody = Buffer.from('test')

    it('throws UnauthorizedException on authentication errors', async () => {
      const awsError = new ServiceException({
        name: 'AccessDeniedException',
        message: 'Access denied',
        $fault: 'client',
        $metadata: {},
      })
      mockUploadDone.mockRejectedValue(awsError)

      await expect(
        service.uploadFile(bucket, mockFileBody, key),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throws ForbiddenException on authorization errors', async () => {
      const awsError = new ServiceException({
        name: 'InsufficientPermissions',
        message: 'Insufficient permissions',
        $fault: 'client',
        $metadata: {},
      })
      mockUploadDone.mockRejectedValue(awsError)

      await expect(
        service.uploadFile(bucket, mockFileBody, key),
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws BadRequestException on various validation errors', async () => {
      const validationErrors = [
        'InvalidInput',
        'InvalidParameter',
        'InvalidParameterValue',
        'ValidationError',
        'InvalidRequest',
        'MalformedQueryString',
        'MissingParameter',
        'InvalidArgument',
      ]

      for (const errorName of validationErrors) {
        const awsError = new ServiceException({
          name: errorName,
          message: 'Validation error',
          $fault: 'client',
          $metadata: {},
        })
        mockUploadDone.mockRejectedValue(awsError)

        await expect(
          service.uploadFile(bucket, mockFileBody, key),
        ).rejects.toThrow(BadRequestException)

        vi.clearAllMocks()
      }
    })
  })
})
