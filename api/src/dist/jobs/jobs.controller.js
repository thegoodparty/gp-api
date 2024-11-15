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
exports.JobsController = void 0;
const common_1 = require("@nestjs/common");
const jobs_service_1 = require("./jobs.service");
let JobsController = class JobsController {
    jobsService;
    logger = new common_1.Logger(jobs_service_1.JobsService.name);
    constructor(jobsService) {
        this.jobsService = jobsService;
    }
    async findAll() {
        try {
            return await this.jobsService.findAll();
        }
        catch (e) {
            this.logger.log(`Error at jobController findAll. e.message: ${e.message}`, e);
            throw new common_1.BadGatewayException(e.message || 'Error occurred while fetching jobs');
        }
    }
    async findOne(id) {
        try {
            const job = await this.jobsService.findOne(id);
            if (!job) {
                throw new common_1.NotFoundException(`Job with id ${id} not found`);
            }
            return job;
        }
        catch (e) {
            this.logger.log(`Error at jobController findOne e.message:${e.message}`, e);
            if (e instanceof common_1.HttpException) {
                throw e;
            }
            throw new common_1.BadGatewayException(e.message || `Error occurred while fetching job with id ${id}`);
        }
    }
};
exports.JobsController = JobsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], JobsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], JobsController.prototype, "findOne", null);
exports.JobsController = JobsController = __decorate([
    (0, common_1.Controller)('jobs'),
    __metadata("design:paramtypes", [jobs_service_1.JobsService])
], JobsController);
//# sourceMappingURL=jobs.controller.js.map