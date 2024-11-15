"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentfulService = void 0;
const contentful_1 = require("contentful");
const common_1 = require("@nestjs/common");
const { CONTENTFUL_SPACE_ID, CONTENTFUL_ACCESS_TOKEN } = process.env;
const contentfulClient = (0, contentful_1.createClient)({
    space: CONTENTFUL_SPACE_ID,
    accessToken: CONTENTFUL_ACCESS_TOKEN,
});
let nextSyncToken = '';
let ContentfulService = class ContentfulService {
    async getSync(initial = false) {
        const { entries, deletedEntries, nextSyncToken: newToken, } = await contentfulClient.sync({
            ...(initial || !nextSyncToken ? { initial: true } : { nextSyncToken }),
        });
        nextSyncToken = newToken;
        return { entries, deletedEntries };
    }
    async getEntry(id) {
        return await contentfulClient.getEntry(id);
    }
};
exports.ContentfulService = ContentfulService;
exports.ContentfulService = ContentfulService = __decorate([
    (0, common_1.Injectable)()
], ContentfulService);
//# sourceMappingURL=contentful.service.js.map