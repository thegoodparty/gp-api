"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("./configrc");
const core_1 = require("@nestjs/core");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const swagger_1 = require("@nestjs/swagger");
const helmet_1 = require("@fastify/helmet");
const cors_1 = require("@fastify/cors");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const static_1 = require("@fastify/static");
const path_1 = require("path");
const APP_LISTEN_CONFIG = {
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || 'localhost',
};
const bootstrap = async () => {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_fastify_1.FastifyAdapter({
        ...(process.env.LOG_LEVEL
            ? {
                logger: { level: process.env.LOG_LEVEL },
            }
            : {}),
    }));
    app.setGlobalPrefix('v1');
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('API Documentation')
        .setDescription('The API description')
        .setVersion('1.0')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('api', app, document);
    await app.register(helmet_1.default);
    await app.register(cors_1.default, {
        origin: process.env.CORS_ORIGIN || '*',
    });
    await app.register(static_1.default, {
        root: (0, path_1.join)(__dirname, '..', 'public'),
        prefix: '/public/',
    });
    await app.listen(APP_LISTEN_CONFIG);
    return app;
};
bootstrap().then(() => {
    const logger = new common_1.Logger('bootstrap');
    logger.log(`App bootstrap successful => ${APP_LISTEN_CONFIG.host}:${APP_LISTEN_CONFIG.port}`);
});
//# sourceMappingURL=main.js.map