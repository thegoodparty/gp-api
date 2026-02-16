import { User, UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UsersController } from './users.controller'
import { UsersService } from './services/users.service'
import { FilesService } from 'src/files/files.service'
import { FileUpload } from 'src/files/files.types'
import { AuthenticationService } from '../authentication/authentication.service'
import { M2MOnly } from '@/authentication/guards/M2MOnly.guard'
import { UserOwnerOrAdminGuard } from './guards/UserOwnerOrAdmin.guard'
import { UpdatePasswordSchemaDto } from './schemas/UpdatePassword.schema'
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

const userId = 1

const mockUser: User = {
  id: userId,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  firstName: 'John',
  lastName: 'Doe',
  name: 'John Doe',
  avatar: null,
  password: null,
  hasPassword: false,
  email: 'john@example.com',
  phone: '5555555555',
  zip: '12345',
  roles: [UserRole.candidate],
  metaData: null,
  passwordResetToken: null,
}

function getGuards(methodName: keyof UsersController) {
  return (
    Reflect.getMetadata('__guards__', UsersController.prototype[methodName]) ??
    []
  )
}

describe('UsersController', () => {
  let controller: UsersController
  let usersService: UsersService
  let filesService: FilesService
  let authService: AuthenticationService

  beforeEach(() => {
    const usersServiceMock: Partial<UsersService> = {
      listUsers: vi.fn(),
      updateUser: vi.fn(),
      findUser: vi.fn(),
      deleteUser: vi.fn(),
      patchUserMetaData: vi.fn(),
      updatePassword: vi.fn(),
    }
    usersService = usersServiceMock as UsersService

    const filesServiceMock: Partial<FilesService> = {
      uploadFile: vi.fn(),
      generateSignedUploadUrl: vi.fn(),
    }
    filesService = filesServiceMock as FilesService

    const authServiceMock: Partial<AuthenticationService> = {
      validatePassword: vi.fn(),
    }
    authService = authServiceMock as AuthenticationService

    controller = new UsersController(usersService, filesService, authService)
  })

  describe('guards', () => {
    it('protects list with M2MOnly guard', () => {
      const guards = getGuards('list')
      expect(guards).toContain(M2MOnly)
    })

    it('protects updateUser with M2MOnly guard', () => {
      const guards = getGuards('updateUser')
      expect(guards).toContain(M2MOnly)
    })

    it('protects findOne with UserOwnerOrAdminGuard', () => {
      const guards = getGuards('findOne')
      expect(guards).toContain(UserOwnerOrAdminGuard)
    })

    it('protects delete with UserOwnerOrAdminGuard', () => {
      const guards = getGuards('delete')
      expect(guards).toContain(UserOwnerOrAdminGuard)
    })

    it('protects updatePassword with UserOwnerOrAdminGuard', () => {
      const guards = getGuards('updatePassword')
      expect(guards).toContain(UserOwnerOrAdminGuard)
    })

    it('does not protect findMe with M2MOnly guard', () => {
      const guards = getGuards('findMe')
      expect(guards).not.toContain(M2MOnly)
    })

    it('does not protect updateMe with M2MOnly guard', () => {
      const guards = getGuards('updateMe')
      expect(guards).not.toContain(M2MOnly)
    })
  })

  describe('list', () => {
    it('returns paginated users parsed through ReadUserOutputSchema', async () => {
      const mockUsers = [
        mockUser,
        { ...mockUser, id: 2, email: 'jane@example.com', firstName: 'Jane' },
      ]
      const mockMeta = { total: 2, offset: 0, limit: 10 }

      vi.spyOn(usersService, 'listUsers').mockResolvedValue({
        data: mockUsers,
        meta: mockMeta,
      })

      const query = { offset: 0, limit: 10 }
      const result = await controller.list(query)

      expect(usersService.listUsers).toHaveBeenCalledWith(query)
      expect(result.meta).toEqual(mockMeta)
      expect(result.data).toHaveLength(2)
      result.data.forEach((user) => {
        expect(user).not.toHaveProperty('password')
        expect(user).not.toHaveProperty('allowTexts')
        expect(user).toHaveProperty('id')
        expect(user).toHaveProperty('email')
      })
    })

    it('strips password from each user in the response', async () => {
      const userWithPassword = { ...mockUser, password: 'secret123' }

      vi.spyOn(usersService, 'listUsers').mockResolvedValue({
        data: [userWithPassword],
        meta: { total: 1, offset: 0, limit: 10 },
      })

      const result = await controller.list({ offset: 0, limit: 10 })

      expect(result.data[0]).not.toHaveProperty('password')
    })

    it('passes query parameters to the service', async () => {
      vi.spyOn(usersService, 'listUsers').mockResolvedValue({
        data: [],
        meta: { total: 0, offset: 0, limit: 5 },
      })

      const query = {
        offset: 10,
        limit: 5,
        firstName: 'John',
        email: 'john@',
      }
      await controller.list(query)

      expect(usersService.listUsers).toHaveBeenCalledWith(query)
    })

    it('returns empty data array when no users match', async () => {
      vi.spyOn(usersService, 'listUsers').mockResolvedValue({
        data: [],
        meta: { total: 0, offset: 0, limit: 10 },
      })

      const result = await controller.list({ offset: 0, limit: 10 })

      expect(result.data).toEqual([])
      expect(result.meta.total).toBe(0)
    })
  })

  describe('updateUser', () => {
    it('updates and returns the user parsed through ReadUserOutputSchema', async () => {
      const updatedUser = { ...mockUser, firstName: 'Updated' }

      vi.spyOn(usersService, 'updateUser').mockResolvedValue(updatedUser)

      const body = { firstName: 'Updated' }
      const result = await controller.updateUser({ id: userId }, body)

      expect(usersService.updateUser).toHaveBeenCalledWith({ id: userId }, body)
      expect(result).toHaveProperty('firstName', 'Updated')
      expect(result).not.toHaveProperty('password')
    })

    it('passes the id to the service', async () => {
      vi.spyOn(usersService, 'updateUser').mockResolvedValue(mockUser)

      await controller.updateUser({ id: 42 }, { lastName: 'Smith' })

      expect(usersService.updateUser).toHaveBeenCalledWith(
        { id: 42 },
        { lastName: 'Smith' },
      )
    })

    it('passes roles to the service when provided', async () => {
      const updatedUser = {
        ...mockUser,
        roles: [UserRole.admin, UserRole.sales],
      }

      vi.spyOn(usersService, 'updateUser').mockResolvedValue(updatedUser)

      const body = { roles: [UserRole.admin, UserRole.sales] }
      const result = await controller.updateUser({ id: userId }, body)

      expect(usersService.updateUser).toHaveBeenCalledWith({ id: userId }, body)
      expect(result).toHaveProperty('roles', [UserRole.admin, UserRole.sales])
    })

    it('strips password from the response', async () => {
      const userWithPassword = {
        ...mockUser,
        password: 'hashed_secret',
        hasPassword: true,
      }

      vi.spyOn(usersService, 'updateUser').mockResolvedValue(userWithPassword)

      const result = await controller.updateUser(
        { id: userId },
        { firstName: 'Test' },
      )

      expect(result).not.toHaveProperty('password')
      expect(result).toHaveProperty('hasPassword', true)
    })
  })

  describe('findOne', () => {
    it('returns the requesting user without a DB call when requesting own data', async () => {
      const result = await controller.findOne({ id: userId }, mockUser)

      expect(usersService.findUser).not.toHaveBeenCalled()
      expect(result).toHaveProperty('id', userId)
      expect(result).not.toHaveProperty('password')
    })

    it('fetches from DB when requesting a different user', async () => {
      const otherUser = { ...mockUser, id: 2, email: 'other@example.com' }
      vi.spyOn(usersService, 'findUser').mockResolvedValue(otherUser)

      const result = await controller.findOne({ id: 2 }, mockUser)

      expect(usersService.findUser).toHaveBeenCalledWith({ id: 2 })
      expect(result).toHaveProperty('id', 2)
      expect(result).not.toHaveProperty('password')
    })

    it('throws NotFoundException when user is not found in DB', async () => {
      vi.spyOn(usersService, 'findUser').mockResolvedValue(null)

      await expect(controller.findOne({ id: 999 }, mockUser)).rejects.toThrow(
        NotFoundException,
      )
    })

    it('strips password from DB-fetched user', async () => {
      const userWithPassword = {
        ...mockUser,
        id: 2,
        email: 'other@example.com',
        password: 'secret',
      }
      vi.spyOn(usersService, 'findUser').mockResolvedValue(userWithPassword)

      const result = await controller.findOne({ id: 2 }, mockUser)

      expect(result).not.toHaveProperty('password')
    })
  })

  describe('findMe', () => {
    it('returns the current user fetched from DB', async () => {
      vi.spyOn(usersService, 'findUser').mockResolvedValue(mockUser)

      const result = await controller.findMe(mockUser)

      expect(usersService.findUser).toHaveBeenCalledWith({ id: userId })
      expect(result).toHaveProperty('id', userId)
      expect(result).not.toHaveProperty('password')
    })

    it('throws when user is not found in DB', async () => {
      vi.spyOn(usersService, 'findUser').mockResolvedValue(null)

      await expect(controller.findMe(mockUser)).rejects.toThrow()
    })
  })

  describe('updateMe', () => {
    it('updates and returns the user with password stripped', async () => {
      const updatedUser = {
        ...mockUser,
        firstName: 'Updated',
        password: 'hashed_secret',
      }
      vi.spyOn(usersService, 'updateUser').mockResolvedValue(updatedUser)

      const body = { firstName: 'Updated' }
      const result = await controller.updateMe(mockUser, body)

      expect(usersService.updateUser).toHaveBeenCalledWith({ id: userId }, body)
      expect(result).toHaveProperty('firstName', 'Updated')
      expect(result).not.toHaveProperty('password')
    })

    it('passes empty object when body is falsy', async () => {
      vi.spyOn(usersService, 'updateUser').mockResolvedValue(mockUser)

      // @ts-expect-error testing defensive null coalescing in controller
      await controller.updateMe(mockUser, undefined)

      expect(usersService.updateUser).toHaveBeenCalledWith({ id: userId }, {})
    })
  })

  describe('getMetadata', () => {
    it('returns the user metaData directly', () => {
      const userWithMeta: User = {
        ...mockUser,
        metaData: { customerId: 'cus_123', lastVisited: 1700000000 },
      }

      const result = controller.getMetadata(userWithMeta)

      expect(result).toEqual({ customerId: 'cus_123', lastVisited: 1700000000 })
    })

    it('returns null when metaData is null', () => {
      const result = controller.getMetadata(mockUser)

      expect(result).toBeNull()
    })
  })

  describe('updateMetadata', () => {
    it('patches user metadata with the provided meta', () => {
      const meta = { customerId: 'cus_456' }
      controller.updateMetadata(mockUser, { meta })

      expect(usersService.patchUserMetaData).toHaveBeenCalledWith(userId, meta)
    })
  })

  describe('uploadImage', () => {
    it('uploads the file and updates the user avatar', async () => {
      const file: FileUpload = {
        data: Buffer.from('image'),
        filename: 'avatar.png',
        mimetype: 'image/png',
        encoding: '7bit',
        fieldname: 'file',
      }
      vi.spyOn(filesService, 'uploadFile').mockResolvedValue(
        'https://cdn.example.com/avatar.png',
      )
      vi.spyOn(usersService, 'updateUser').mockResolvedValue({
        ...mockUser,
        avatar: 'https://cdn.example.com/avatar.png',
      })

      const result = await controller.uploadImage(mockUser, file)

      expect(filesService.uploadFile).toHaveBeenCalledWith(file, 'uploads')
      expect(usersService.updateUser).toHaveBeenCalledWith(
        { id: userId },
        { avatar: 'https://cdn.example.com/avatar.png' },
      )
      expect(result).toHaveProperty(
        'avatar',
        'https://cdn.example.com/avatar.png',
      )
      expect(result).not.toHaveProperty('password')
    })

    it('throws BadRequestException when no file is provided', async () => {
      await expect(controller.uploadImage(mockUser, undefined)).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  describe('delete', () => {
    it('deletes the user by id', async () => {
      vi.spyOn(usersService, 'deleteUser').mockResolvedValue(mockUser)

      await controller.delete({ id: userId })

      expect(usersService.deleteUser).toHaveBeenCalledWith(userId)
    })

    it('silently handles Prisma P2025 (record not found) error', async () => {
      const prismaError = new PrismaClientKnownRequestError(
        'Record to delete does not exist.',
        { code: 'P2025', clientVersion: '5.0.0' },
      )
      vi.spyOn(usersService, 'deleteUser').mockRejectedValue(prismaError)

      await expect(controller.delete({ id: 999 })).resolves.toBeUndefined()
    })

    it('rethrows non-P2025 Prisma errors', async () => {
      const prismaError = new PrismaClientKnownRequestError(
        'Foreign key constraint failed.',
        { code: 'P2003', clientVersion: '5.0.0' },
      )
      vi.spyOn(usersService, 'deleteUser').mockRejectedValue(prismaError)

      await expect(controller.delete({ id: userId })).rejects.toThrow(
        PrismaClientKnownRequestError,
      )
    })

    it('rethrows non-Prisma errors', async () => {
      vi.spyOn(usersService, 'deleteUser').mockRejectedValue(
        new Error('DB connection lost'),
      )

      await expect(controller.delete({ id: userId })).rejects.toThrow(
        'DB connection lost',
      )
    })
  })

  describe('generateSignedUploadUrl', () => {
    it('returns the signed upload URL', async () => {
      vi.spyOn(filesService, 'generateSignedUploadUrl').mockResolvedValue(
        'https://s3.example.com/signed-url',
      )

      const args = {
        bucket: 'uploads',
        fileName: 'doc.pdf',
        fileType: 'application/pdf',
      }
      const result = await controller.generateSignedUploadUrl(args)

      expect(filesService.generateSignedUploadUrl).toHaveBeenCalledWith(args)
      expect(result).toEqual({
        signedUploadUrl: 'https://s3.example.com/signed-url',
      })
    })
  })

  describe('updatePassword', () => {
    it('updates password when user has no existing password', async () => {
      vi.spyOn(usersService, 'updatePassword').mockResolvedValue(mockUser)

      await controller.updatePassword(
        { newPassword: 'NewPass123' } as UpdatePasswordSchemaDto,
        mockUser,
      )

      expect(authService.validatePassword).not.toHaveBeenCalled()
      expect(usersService.updatePassword).toHaveBeenCalledWith(
        userId,
        'NewPass123',
      )
    })

    it('validates against empty string when user has no existing password but oldPassword is provided', async () => {
      vi.spyOn(authService, 'validatePassword').mockResolvedValue(true)
      vi.spyOn(usersService, 'updatePassword').mockResolvedValue(mockUser)

      await controller.updatePassword(
        { newPassword: 'NewPass123', oldPassword: 'SomePass1' },
        mockUser,
      )

      expect(authService.validatePassword).toHaveBeenCalledWith('SomePass1', '')
      expect(usersService.updatePassword).toHaveBeenCalledWith(
        userId,
        'NewPass123',
      )
    })

    it('throws BadRequestException when user has password but oldPassword is not provided', async () => {
      const userWithPassword = {
        ...mockUser,
        hasPassword: true,
        password: 'hashed',
      }

      await expect(
        controller.updatePassword(
          { newPassword: 'NewPass123' } as UpdatePasswordSchemaDto,
          userWithPassword,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('validates old password and updates when correct', async () => {
      const userWithPassword = {
        ...mockUser,
        hasPassword: true,
        password: 'hashed_old',
      }
      vi.spyOn(authService, 'validatePassword').mockResolvedValue(true)
      vi.spyOn(usersService, 'updatePassword').mockResolvedValue(mockUser)

      await controller.updatePassword(
        { newPassword: 'NewPass123', oldPassword: 'OldPass123' },
        userWithPassword,
      )

      expect(authService.validatePassword).toHaveBeenCalledWith(
        'OldPass123',
        'hashed_old',
      )
      expect(usersService.updatePassword).toHaveBeenCalledWith(
        userId,
        'NewPass123',
      )
    })

    it('throws UnauthorizedException when old password is incorrect', async () => {
      const userWithPassword = {
        ...mockUser,
        hasPassword: true,
        password: 'hashed_old',
      }
      vi.spyOn(authService, 'validatePassword').mockResolvedValue(false)

      await expect(
        controller.updatePassword(
          { newPassword: 'NewPass123', oldPassword: 'WrongPass1' },
          userWithPassword,
        ),
      ).rejects.toThrow(UnauthorizedException)

      expect(usersService.updatePassword).not.toHaveBeenCalled()
    })
  })
})
