import { PrismaService } from '../prisma/prisma.service';
import { ContentfulService } from '../contentful/contentful.service';
export declare class ContentService {
    private prisma;
    private contentfulService;
    constructor(prisma: PrismaService, contentfulService: ContentfulService);
    findAll(): import(".prisma/client").Prisma.PrismaPromise<{
        createdAt: Date | null;
        updatedAt: Date | null;
        id: string;
        type: import(".prisma/client").$Enums.ContentType;
        data: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    findOne(id: number): string;
    private getExistingContentIds;
    syncContent(seed?: boolean): Promise<{
        entries: import("contentful").Entry[];
        createEntries: import("contentful").Entry[];
        updateEntries: import("contentful").Entry[];
        deletedEntries: import("contentful").DeletedEntry[];
    }>;
}
