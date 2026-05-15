import { useTestService } from '@/test-service'
import { PrismaService } from '@/prisma/prisma.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { ConflictException } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'
import { ChatMessageRole } from '@prisma/client'
import { ChatStoreService } from './chatStore.prisma'

const service = useTestService()

const createOtherUser = async () =>
  service.prisma.user.create({
    data: {
      id: 456,
      email: 'other@goodparty.org',
      firstName: 'Other',
      lastName: 'Person',
    },
  })

const createConversation = async (ownerUserId: number) =>
  service.prisma.chatConversation.create({
    data: { ownerUserId },
  })

describe('ChatStoreService', () => {
  let store: ChatStoreService

  beforeEach(() => {
    const prisma = service.app.get(PrismaService)
    store = new ChatStoreService()
    Object.defineProperty(store, '_prisma', {
      get: () => prisma,
      configurable: true,
    })
    Object.defineProperty(store, 'logger', {
      get: () => createMockLogger(),
      configurable: true,
    })
    store.onModuleInit()
  })

  describe('findConversationByIdAndOwner', () => {
    it('returns the row when id and ownerUserId match', async () => {
      const convo = await createConversation(service.user.id)

      const found = await store.findConversationByIdAndOwner(
        convo.id,
        service.user.id,
      )

      expect(found?.id).toBe(convo.id)
      expect(found?.ownerUserId).toBe(service.user.id)
      expect(found?.deletedAt).toBeNull()
    })

    it('returns null when id does not exist', async () => {
      const found = await store.findConversationByIdAndOwner(
        'nonexistent-id',
        service.user.id,
      )

      expect(found).toBeNull()
    })

    it('returns null when ownerUserId does not match', async () => {
      const other = await createOtherUser()
      const convo = await createConversation(other.id)

      const found = await store.findConversationByIdAndOwner(
        convo.id,
        service.user.id,
      )

      expect(found).toBeNull()
    })

    it('returns null when the conversation is soft-deleted', async () => {
      const convo = await createConversation(service.user.id)
      await service.prisma.chatConversation.update({
        where: { id: convo.id },
        data: { deletedAt: new Date() },
      })

      const found = await store.findConversationByIdAndOwner(
        convo.id,
        service.user.id,
      )

      expect(found).toBeNull()
    })
  })

  describe('listMessagesByConversation', () => {
    it('returns messages ordered by createdAt ASC', async () => {
      const convo = await createConversation(service.user.id)
      const earliest = new Date('2026-01-01T00:00:00Z')
      const middle = new Date('2026-01-02T00:00:00Z')
      const latest = new Date('2026-01-03T00:00:00Z')

      await service.prisma.chatMessage.create({
        data: {
          conversationId: convo.id,
          role: ChatMessageRole.assistant,
          content: 'middle',
          createdAt: middle,
        },
      })
      await service.prisma.chatMessage.create({
        data: {
          conversationId: convo.id,
          role: ChatMessageRole.user,
          content: 'latest',
          createdAt: latest,
        },
      })
      await service.prisma.chatMessage.create({
        data: {
          conversationId: convo.id,
          role: ChatMessageRole.user,
          content: 'earliest',
          createdAt: earliest,
        },
      })

      const messages = await store.listMessagesByConversation(convo.id)

      expect(messages.map((m) => m.content)).toEqual([
        'earliest',
        'middle',
        'latest',
      ])
    })

    it('returns an empty array when the conversation has no messages', async () => {
      const convo = await createConversation(service.user.id)

      const messages = await store.listMessagesByConversation(convo.id)

      expect(messages).toEqual([])
    })

    it('returns an empty array when the conversation does not exist', async () => {
      const messages = await store.listMessagesByConversation('nope')

      expect(messages).toEqual([])
    })

    it('returns an empty array when the conversation is soft-deleted', async () => {
      const convo = await createConversation(service.user.id)
      await service.prisma.chatMessage.create({
        data: {
          conversationId: convo.id,
          role: ChatMessageRole.user,
          content: 'secret',
        },
      })
      await service.prisma.chatConversation.update({
        where: { id: convo.id },
        data: { deletedAt: new Date() },
      })

      const messages = await store.listMessagesByConversation(convo.id)

      expect(messages).toEqual([])
    })
  })

  describe('listRecentMessagesByConversation', () => {
    it('returns at most limit messages ordered ASC (most recent slice)', async () => {
      const convo = await createConversation(service.user.id)
      for (let i = 0; i < 10; i++) {
        await service.prisma.chatMessage.create({
          data: {
            conversationId: convo.id,
            role: ChatMessageRole.user,
            content: `msg-${i}`,
            createdAt: new Date(
              `2026-01-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`,
            ),
          },
        })
      }

      const messages = await store.listRecentMessagesByConversation(convo.id, 3)

      expect(messages.map((m) => m.content)).toEqual([
        'msg-7',
        'msg-8',
        'msg-9',
      ])
    })

    it('returns all messages when count is less than limit', async () => {
      const convo = await createConversation(service.user.id)
      await service.prisma.chatMessage.create({
        data: {
          conversationId: convo.id,
          role: ChatMessageRole.user,
          content: 'only',
        },
      })

      const messages = await store.listRecentMessagesByConversation(
        convo.id,
        40,
      )

      expect(messages).toHaveLength(1)
      expect(messages[0].content).toBe('only')
    })

    it('returns empty when the conversation is soft-deleted', async () => {
      const convo = await createConversation(service.user.id)
      await service.prisma.chatMessage.create({
        data: {
          conversationId: convo.id,
          role: ChatMessageRole.user,
          content: 'secret',
        },
      })
      await service.prisma.chatConversation.update({
        where: { id: convo.id },
        data: { deletedAt: new Date() },
      })

      const messages = await store.listRecentMessagesByConversation(
        convo.id,
        40,
      )

      expect(messages).toEqual([])
    })
  })

  describe('appendMessage', () => {
    it('persists a message with the given role and content', async () => {
      const convo = await createConversation(service.user.id)
      const content = 'hello world'

      const created = await store.appendMessage({
        conversationId: convo.id,
        role: ChatMessageRole.user,
        content,
      })

      expect(created.conversationId).toBe(convo.id)
      expect(created.role).toBe(ChatMessageRole.user)
      expect(created.content).toBe(content)
      expect(created.createdAt).toBeInstanceOf(Date)

      const persisted = await service.prisma.chatMessage.findUniqueOrThrow({
        where: { id: created.id },
      })
      expect(persisted.content).toBe(content)
      expect(persisted.role).toBe(ChatMessageRole.user)
    })

    it('throws a Prisma error when conversationId does not exist', async () => {
      await expect(
        store.appendMessage({
          conversationId: 'does-not-exist',
          role: ChatMessageRole.assistant,
          content: 'orphan',
        }),
      ).rejects.toThrow()
    })

    it('stores clientMessageId when provided', async () => {
      const convo = await createConversation(service.user.id)

      const created = await store.appendMessage({
        conversationId: convo.id,
        role: ChatMessageRole.user,
        content: 'hi',
        clientMessageId: 'cid-1',
      })

      const persisted = await service.prisma.chatMessage.findUniqueOrThrow({
        where: { id: created.id },
      })
      expect(persisted.clientMessageId).toBe('cid-1')
    })

    it('returns the existing row when called twice with the same clientMessageId AND payload', async () => {
      const convo = await createConversation(service.user.id)

      const first = await store.appendMessage({
        conversationId: convo.id,
        role: ChatMessageRole.user,
        content: 'hi',
        clientMessageId: 'dupe-1',
      })

      const second = await store.appendMessage({
        conversationId: convo.id,
        role: ChatMessageRole.user,
        content: 'hi',
        clientMessageId: 'dupe-1',
      })

      expect(second.id).toBe(first.id)
      expect(second.content).toBe('hi')

      const count = await service.prisma.chatMessage.count({
        where: { conversationId: convo.id, clientMessageId: 'dupe-1' },
      })
      expect(count).toBe(1)
    })

    it('throws ConflictException when clientMessageId is reused with different content', async () => {
      const convo = await createConversation(service.user.id)

      await store.appendMessage({
        conversationId: convo.id,
        role: ChatMessageRole.user,
        content: 'hello',
        clientMessageId: 'mismatch-1',
      })

      await expect(
        store.appendMessage({
          conversationId: convo.id,
          role: ChatMessageRole.user,
          content: 'goodbye',
          clientMessageId: 'mismatch-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException)

      const count = await service.prisma.chatMessage.count({
        where: { conversationId: convo.id, clientMessageId: 'mismatch-1' },
      })
      expect(count).toBe(1)
    })

    it('throws ConflictException when clientMessageId is reused with a different role', async () => {
      const convo = await createConversation(service.user.id)

      await store.appendMessage({
        conversationId: convo.id,
        role: ChatMessageRole.user,
        content: 'same',
        clientMessageId: 'role-mismatch',
      })

      await expect(
        store.appendMessage({
          conversationId: convo.id,
          role: ChatMessageRole.assistant,
          content: 'same',
          clientMessageId: 'role-mismatch',
        }),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    it('allows independent rows when clientMessageId is null on both', async () => {
      const convo = await createConversation(service.user.id)

      const first = await store.appendMessage({
        conversationId: convo.id,
        role: ChatMessageRole.user,
        content: 'a',
      })
      const second = await store.appendMessage({
        conversationId: convo.id,
        role: ChatMessageRole.user,
        content: 'b',
      })

      expect(first.id).not.toBe(second.id)
    })
  })

  describe('softDeleteConversation', () => {
    it('sets deletedAt when id and ownerUserId match', async () => {
      const convo = await createConversation(service.user.id)

      await store.softDeleteConversation(convo.id, service.user.id)

      const after = await service.prisma.chatConversation.findUniqueOrThrow({
        where: { id: convo.id },
      })
      expect(after.deletedAt).toBeInstanceOf(Date)
    })

    it('is a no-op when id does not match', async () => {
      const convo = await createConversation(service.user.id)

      await store.softDeleteConversation('wrong-id', service.user.id)

      const after = await service.prisma.chatConversation.findUniqueOrThrow({
        where: { id: convo.id },
      })
      expect(after.deletedAt).toBeNull()
    })

    it('is a no-op when ownerUserId does not match', async () => {
      const other = await createOtherUser()
      const convo = await createConversation(other.id)

      await store.softDeleteConversation(convo.id, service.user.id)

      const after = await service.prisma.chatConversation.findUniqueOrThrow({
        where: { id: convo.id },
      })
      expect(after.deletedAt).toBeNull()
    })

    it('does not overwrite deletedAt when row is already soft-deleted', async () => {
      const convo = await createConversation(service.user.id)
      const firstDeletedAt = new Date('2026-01-01T00:00:00Z')
      await service.prisma.chatConversation.update({
        where: { id: convo.id },
        data: { deletedAt: firstDeletedAt },
      })

      await store.softDeleteConversation(convo.id, service.user.id)

      const after = await service.prisma.chatConversation.findUniqueOrThrow({
        where: { id: convo.id },
      })
      expect(after.deletedAt?.toISOString()).toBe(firstDeletedAt.toISOString())
    })
  })

  describe('appendUserMessageIfAlive', () => {
    it('returns persisted message when conversation is alive', async () => {
      const convo = await createConversation(service.user.id)

      const result = await store.appendUserMessageIfAlive({
        conversationId: convo.id,
        ownerUserId: service.user.id,
        content: 'hello',
      })

      expect(result).not.toBeNull()
      expect(result?.role).toBe(ChatMessageRole.user)
      expect(result?.content).toBe('hello')
      const persisted = await service.prisma.chatMessage.findMany({
        where: { conversationId: convo.id },
      })
      expect(persisted).toHaveLength(1)
    })

    it('returns null and does not persist when conversation is soft-deleted', async () => {
      const convo = await createConversation(service.user.id)
      await service.prisma.chatConversation.update({
        where: { id: convo.id },
        data: { deletedAt: new Date() },
      })

      const result = await store.appendUserMessageIfAlive({
        conversationId: convo.id,
        ownerUserId: service.user.id,
        content: 'hello',
      })

      expect(result).toBeNull()
      const persisted = await service.prisma.chatMessage.findMany({
        where: { conversationId: convo.id },
      })
      expect(persisted).toHaveLength(0)
    })

    it('returns null when ownerUserId does not match', async () => {
      const other = await createOtherUser()
      const convo = await createConversation(other.id)

      const result = await store.appendUserMessageIfAlive({
        conversationId: convo.id,
        ownerUserId: service.user.id,
        content: 'hello',
      })

      expect(result).toBeNull()
      const persisted = await service.prisma.chatMessage.findMany({
        where: { conversationId: convo.id },
      })
      expect(persisted).toHaveLength(0)
    })

    it('returns null when conversation does not exist', async () => {
      const result = await store.appendUserMessageIfAlive({
        conversationId: 'nope',
        ownerUserId: service.user.id,
        content: 'hello',
      })

      expect(result).toBeNull()
    })

    it('is idempotent when clientMessageId is reused with the same payload', async () => {
      const convo = await createConversation(service.user.id)

      const first = await store.appendUserMessageIfAlive({
        conversationId: convo.id,
        ownerUserId: service.user.id,
        content: 'hi',
        clientMessageId: 'cid-x',
      })
      const second = await store.appendUserMessageIfAlive({
        conversationId: convo.id,
        ownerUserId: service.user.id,
        content: 'hi',
        clientMessageId: 'cid-x',
      })

      expect(first).not.toBeNull()
      expect(second?.id).toBe(first?.id)
      const persisted = await service.prisma.chatMessage.findMany({
        where: { conversationId: convo.id },
      })
      expect(persisted).toHaveLength(1)
    })
  })

  describe('softDeleteConversation cascading to annotation', () => {
    it('hard-deletes the owning chat-kind Annotation row', async () => {
      const convo = await createConversation(service.user.id)
      const annotation = await service.prisma.annotation.create({
        data: {
          authorUserId: service.user.id,
          kind: 'chat',
          resourceId: 'briefing-x',
          resourceType: 'briefing',
          chatConversationId: convo.id,
        },
      })

      await store.softDeleteConversation(convo.id, service.user.id)

      const stillThere = await service.prisma.annotation.findUnique({
        where: { id: annotation.id },
      })
      expect(stillThere).toBeNull()

      const convoAfter =
        await service.prisma.chatConversation.findUniqueOrThrow({
          where: { id: convo.id },
        })
      expect(convoAfter.deletedAt).toBeInstanceOf(Date)
    })

    it('does not delete unrelated annotations on a different conversation', async () => {
      const convoA = await createConversation(service.user.id)
      const convoB = await createConversation(service.user.id)
      const keep = await service.prisma.annotation.create({
        data: {
          authorUserId: service.user.id,
          kind: 'chat',
          resourceId: 'briefing-y',
          resourceType: 'briefing',
          chatConversationId: convoB.id,
        },
      })

      await store.softDeleteConversation(convoA.id, service.user.id)

      const survivor = await service.prisma.annotation.findUnique({
        where: { id: keep.id },
      })
      expect(survivor).not.toBeNull()
    })

    it('is a no-op on annotation when ownerUserId does not match', async () => {
      const other = await createOtherUser()
      const convo = await createConversation(other.id)
      const annotation = await service.prisma.annotation.create({
        data: {
          authorUserId: other.id,
          kind: 'chat',
          resourceId: 'briefing-z',
          resourceType: 'briefing',
          chatConversationId: convo.id,
        },
      })

      await store.softDeleteConversation(convo.id, service.user.id)

      const stillThere = await service.prisma.annotation.findUnique({
        where: { id: annotation.id },
      })
      expect(stillThere).not.toBeNull()
    })
  })
})
