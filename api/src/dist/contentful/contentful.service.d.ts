import { DeletedEntry, Entry } from 'contentful';
export declare class ContentfulService {
    getSync(initial?: boolean): Promise<{
        entries: Entry[];
        deletedEntries: DeletedEntry[];
    }>;
    getEntry(id: string): Promise<Entry<import("contentful").EntrySkeletonType, undefined, string>>;
}
