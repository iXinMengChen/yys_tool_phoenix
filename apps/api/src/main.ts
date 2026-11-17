import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { env } from './env'
import { requestLoggerMiddleware } from './common/middleware/request-logger.middleware'
import { ApiExceptionFilter } from './common/filters/api-exception.filter'
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor'

const logger = new Logger('API')
const maxJsonBodyBytes = 5 * 1024 * 1024

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  })
  app.enableShutdownHooks()
  app.set('trust proxy', 'loopback')
  app.useBodyParser('json', { limit: maxJsonBodyBytes })
  app.setGlobalPrefix(env.baseUrl)
  app.use(requestLoggerMiddleware)
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
    }),
  )
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor())
  app.useGlobalFilters(new ApiExceptionFilter())

  const swaggerConfig = new DocumentBuilder()
    .setTitle('萌新绝学之号来 API')
    .setDescription('Phoenix API：健康检查、藏宝阁账号查询与御魂快照。所有业务端点按客户端 IP 限流：普通接口合计 10 次/10 秒，图片接口独立合计 60 次/10 秒；超限返回 429 和 Retry-After（秒）。')
    .addGlobalResponse({
      status: 429,
      description: '短时访问过于频繁；普通接口 10 次/10 秒，图片接口 60 次/10 秒，各组按 IP 合计。已有业务冷却规则仍生效。',
      headers: { 'Retry-After': { description: '短时限流剩余等待秒数', schema: { type: 'integer', minimum: 1 } } },
      schema: { example: { code: 429, message: '访问过于频繁，请稍后重试', data: null } },
    })
    .setVersion('0.1.0')
    .build()
  const swaggerPath = `${env.baseUrl.replace(/^\/+|\/+$/g, '')}/docs`
  const swaggerDocument = () => SwaggerModule.createDocument(app, swaggerConfig)

  SwaggerModule.setup(swaggerPath, app, swaggerDocument, {
    customSiteTitle: '萌新绝学之号来 API 文档',
  })

  await app.listen(env.apiPort, '127.0.0.1')
  logger.log(
    `服务已启动：${await app.getUrl()}（Swagger：${swaggerPath}，健康检查：${env.baseUrl}/health）`,
  )
}

void bootstrap()
