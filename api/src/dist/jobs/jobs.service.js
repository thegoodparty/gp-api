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
exports.JobsService = void 0;
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const API_BASE = 'https://api.ashbyhq.com/jobPosting';
const ASHBEY_KEY = process.env.ASHBEY_KEY;
let JobsService = class JobsService {
    httpService;
    constructor(httpService) {
        this.httpService = httpService;
    }
    async findAll() {
        return await this.fetchJobs('list', { listedOnly: true });
    }
    async findOne(id) {
        return await this.fetchJobs('info', { jobPostingId: id });
    }
    async fetchJobs(type, params) {
        const url = `${API_BASE}.${type}`;
        const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(url, params, {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Basic ${Buffer.from(ASHBEY_KEY + ':').toString('base64')}`,
            },
        }));
        return response.data.results;
    }
};
exports.JobsService = JobsService;
exports.JobsService = JobsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService])
], JobsService);
//# sourceMappingURL=jobs.service.js.map