import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { env } from '../env'

const databaseConnectionTimeoutMs = 5_000

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: env.databaseUrl,
        connectionTimeoutMillis: databaseConnectionTimeoutMs,
      }),
    })
  }

  async onModuleInit() {
    await this.$connect()
    const target = await this.$queryRaw<Array<{
      database: string; role: string; schema: string | null; address: string | null; port: number | null
    }>>`SELECT current_database() AS database, current_user AS role,
      current_schema() AS schema, inet_server_addr()::text AS address, inet_server_port() AS port`
    new Logger(PrismaService.name).log(`数据库已连接 ${JSON.stringify(target[0])}`)
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
