"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const contentful_service_1 = require("../contentful/contentful.service");
const client_1 = require("@prisma/client");
const CONTENT_TYPE_MAP = {
    aiChatPrompt: client_1.ContentType.aiChatPrompt,
    aiContentTemplate: client_1.ContentType.aiContentTemplate,
    articleCategory: client_1.ContentType.articleCategory,
    blogArticle: client_1.ContentType.blogArticle,
    blogHome: client_1.ContentType.blogHome,
    blogSection: client_1.ContentType.blogSection,
    candidateTestimonial: client_1.ContentType.candidateTestimonial,
    election: client_1.ContentType.election,
    faqArticle: client_1.ContentType.faqArticle,
    faqOrder: client_1.ContentType.faqOrder,
    glossaryItem: client_1.ContentType.glossaryItem,
    goodPartyTeamMembers: client_1.ContentType.goodPartyTeamMembers,
    onboardingPrompts: client_1.ContentType.onboardingPrompts,
    pledge: client_1.ContentType.pledge,
    privacyPage: client_1.ContentType.privacyPage,
    promptInputFields: client_1.ContentType.promptInputFields,
    redirects: client_1.ContentType.redirects,
    teamMember: client_1.ContentType.teamMember,
    teamMilestone: client_1.ContentType.teamMilestone,
    termsOfService: client_1.ContentType.termsOfService,
};
let ContentService = class ContentService {
    prisma;
    contentfulService;
    constructor(prisma, contentfulService) {
        this.prisma = prisma;
        this.contentfulService = contentfulService;
    }
    findAll() {
        return this.prisma.content.findMany();
    }
    findOne(id) {
        return `This action returns a #${id} content`;
    }
    async getExistingContentIds() {
        return new Set((await this.prisma.content.findMany({
            select: {
                id: true,
            },
        })).map(({ id }) => id));
    }
    async syncContent(seed = false) {
        const { entries = [], deletedEntries = [] } = await this.contentfulService.getSync(seed);
        const recognizedEntries = entries.filter((entry) => CONTENT_TYPE_MAP[entry.sys.contentType.sys.id]);
        const entryIds = new Set(recognizedEntries.map((entry) => entry.sys.id));
        const existingContentIds = await this.getExistingContentIds();
        const existingEntries = existingContentIds.intersection(entryIds);
        const newEntryIds = entryIds.difference(existingContentIds);
        const deletedEntryIds = deletedEntries.map((entry) => entry.sys.id);
        const updateEntries = recognizedEntries.filter((entry) => existingEntries.has(entry.sys.id));
        const createEntries = recognizedEntries.filter((entry) => newEntryIds.has(entry.sys.id));
        await this.prisma.$transaction(async (tx) => {
            for (const entry of updateEntries) {
                await tx.content.update({
                    where: {
                        id: entry.sys.id,
                    },
                    data: {
                        data: entry.fields,
                    },
                });
            }
            for (const entry of createEntries) {
                await tx.content.create({
                    data: {
                        id: entry.sys.id,
                        type: CONTENT_TYPE_MAP[entry.sys.contentType.sys.id],
                        data: entry.fields,
                    },
                });
            }
            await tx.content.deleteMany({
                where: {
                    id: {
                        in: deletedEntryIds,
                    },
                },
            });
        }, { timeout: 60 * 1000 });
        return {
            entries: recognizedEntries,
            createEntries,
            updateEntries,
            deletedEntries,
        };
    }
};
exports.ContentService = ContentService;
exports.ContentService = ContentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        contentful_service_1.ContentfulService])
], ContentService);
//# sourceMappingURL=content.service.js.map