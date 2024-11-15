import { JobsService } from './jobs.service';
export declare class JobsController {
    private readonly jobsService;
    private readonly logger;
    constructor(jobsService: JobsService);
    findAll(): Promise<any>;
    findOne(id: string): Promise<any>;
}
