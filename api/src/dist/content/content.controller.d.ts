import { ContentService } from './content.service';
export declare class ContentController {
    private readonly contentService;
    constructor(contentService: ContentService);
    findAll(): import(".prisma/client").Prisma.PrismaPromise<{
        createdAt: Date | null;
        updatedAt: Date | null;
        id: string;
        type: import(".prisma/client").$Enums.ContentType;
        data: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    findOne(id: string): string;
    sync(seed?: boolean): Promise<{
        entriesCount: number;
        createEntriesCount: number;
        updateEntriesCount: number;
        deletedEntriesCount: number;
    }>;
}
