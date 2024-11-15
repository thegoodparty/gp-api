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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentController = void 0;
const common_1 = require("@nestjs/common");
const content_service_1 = require("./content.service");
let ContentController = class ContentController {
    contentService;
    constructor(contentService) {
        this.contentService = contentService;
    }
    findAll() {
        return this.contentService.findAll();
    }
    findOne(id) {
        return this.contentService.findOne(+id);
    }
    async sync(seed = false) {
        const { entries, createEntries, updateEntries, deletedEntries } = await this.contentService.syncContent(seed);
        return {
            entriesCount: entries.length,
            createEntriesCount: createEntries.length,
            updateEntriesCount: updateEntries.length,
            deletedEntriesCount: deletedEntries.length,
        };
    }
};
exports.ContentController = ContentController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)('sync'),
    __param(0, (0, common_1.Query)('seed')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Boolean]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "sync", null);
exports.ContentController = ContentController = __decorate([
    (0, common_1.Controller)('content'),
    __metadata("design:paramtypes", [content_service_1.ContentService])
], ContentController);
//# sourceMappingURL=content.controller.js.map