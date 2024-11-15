import { HttpService } from '@nestjs/axios';
export declare class JobsService {
    private readonly httpService;
    constructor(httpService: HttpService);
    findAll(): Promise<any>;
    findOne(id: string): Promise<any>;
    private fetchJobs;
}
