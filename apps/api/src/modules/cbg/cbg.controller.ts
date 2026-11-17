import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ApiBadGatewayResponse, ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiServiceUnavailableResponse, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger'
import { CbgService } from './cbg.service'
import { CbgProductSummaryService } from './cbg-product-summary.service'
import { ProductSummaryDto } from './product-summary.dto'
import { CbgSessionService } from './cbg-session.service'
import { ProductQueryDto } from './product-query.dto'
import { StaticQueryDto } from './static-query.dto'
import { CbgCollectionImagesService } from './cbg-collection-images.service'

@ApiTags('藏宝阁')
@Controller('cbg')
export class CbgController {
  constructor(
    private readonly cbg: CbgService,
    private readonly session: CbgSessionService,
    private readonly images: CbgCollectionImagesService,
    private readonly summaries: CbgProductSummaryService,
  ) {}

  @Get('product')
  @ApiOperation({ summary: '查询精简商品数据', description: '按渠道、区服及订单号优先读取 3 天数据库缓存；缓存命中直接返回；未命中按先来后到排队，轮到后先等待 2 秒再查询上游，进程内同一时间仅执行一次商品上游查询，同一商品并发合并。随后刷新官方渠道服务端会话并校验、递归白名单剪枝上游数据，缓存成功结果并返回 CbgProductData。equip_desc 恒为对象；账号/式神/御魂视图转换及本地历史由客户端完成。服务端仅缓存精简商品数据，不接受 SID/Cookie。' })
  @ApiOkResponse({
    description: 'data 为 CbgProductData：schemaVersion=1、channel、无跟踪参数的 sourceUrl、equip（精选商品字段及对象 equip_desc）。数值可为 number/string，非必需字段可缺失或为 null；货币、技能、御魂属性与强化原始数值保留。',
    schema: { example: { code: 200, message: 'success', data: {
      schemaVersion: 1, channel: 'official', sourceUrl: 'https://yys.cbg.163.com/cgi/mweb/equip/1/PRODUCT_ORDER_ID',
      equip: { price: '12345', equip_name: '藏宝阁商品', equip_desc: {
        lv: '60', money: '100000', goyu: '1200',
        heroes: { a: { heroId: '100', lv: '40', skinfo: [['1', '5']], selectSkills: ['1'] } },
        inventory: { a: { uuid: 'r1', pos: '2', suitid: '300001', level: '15', qua: '6', attrs: [['速度', '57']], rattr: [['speedAdditionVal', '0.99']] } },
        hero_history: { ssr: { all: '1', got: '1', '100': ['', '1'] } }, damo_count_dict: { '1': { '411': '2' } },
      } },
    } } },
  })
  @ApiBadRequestResponse({ description: '商品参数不合法或包含不允许字段' })
  @ApiTooManyRequestsResponse({ description: 'IP 短时访问超限，或上游触发风控使本进程查询暂停；未缓存商品并发排队等待，缓存命中不受商品专用等待和排队限制，但仍受全局 IP 限流。' })
  @ApiBadGatewayResponse({ description: '上游连接/会话刷新/数据格式异常（公开通用错误）' })
  @ApiServiceUnavailableResponse({ description: '服务端会话未配置（公开通用错误）' })
  product(@Query() query: ProductQueryDto) { return this.cbg.product(query) }

  @Post('product-summary')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '上传商品摘要', description: '接收客户端生成的纯文本摘要，按渠道、区服与订单号更新独立 ProductSummary 表；从本次上传起保留三个 UTC 自然月（月末截断），来源固定为 client_upload，未经上游核实。不会触发商品查询，也不会自动上传本地账号；不接受 Cookie、SID、原始账号对象等额外字段。仍受普通 IP 访问额度限制。' })
  @ApiOkResponse({ description: '数据库保存成功后返回 CbgProductSummaryReceipt；id 稳定，uploadedAt/expiresAt 为 ISO 时间。', schema: { example: { code: 200, message: 'success', data: { id: 'uuid', source: 'client_upload', uploadedAt: '2026-11-17T06:00:00.000Z', expiresAt: '2027-02-17T06:00:00.000Z' } } } })
  @ApiBadRequestResponse({ description: '商品标识无效，摘要为空、超过 32000 字符或含未知字段' })
  uploadSummary(@Body() body: ProductSummaryDto) { return this.summaries.upload(body) }

  @Get('session')
  @ApiOperation({ summary: '读取服务端会话配置状态（不返回凭据）' })
  @ApiOkResponse({ schema: { example: { code: 200, message: 'success', data: { configured: true, refreshedAt: null } } } })
  sessionStatus() { return this.session.status() }

  @Get('images/*path')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: '读取语义路径图片', description: '按静态目录发布的语义路径读取官方图片，例如 heroes/200.png、skins/200/410101.png；只接受已批准来源映射出的路径。' })
  @ApiParam({ name: 'path', description: '语义图片路径，不含 /cbg/images/ 前缀' })
  @ApiProduces('image/png', 'image/jpeg', 'image/gif', 'image/webp')
  @ApiOkResponse({ description: '官方图片原始二进制', schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: '图片路径不存在、来源未批准或图片暂不可用' })
  async imagePath(@Param('path') path: string | string[], @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store')
    const image = await this.images.imagePath(Array.isArray(path) ? path.join('/') : path)
    response.setHeader('Cache-Control', 'public, max-age=3600')
    return image
  }

  @Get('collection-images/:kind/:id')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: '读取官方收藏图片缓存', description: '只接受已公开收藏目录中的类别与数字 ID，固定官方图片模板；阴阳师皮肤可按已验证皮肤组解析角色，兼容缺少角色配对的旧历史。返回原始图片字节，不使用 JSON 成功信封。未缓存时按需补齐，失败保留已有图片。' })
  @ApiParam({ name: 'kind', description: '收藏目录类别，与 collections 的键一致' })
  @ApiParam({ name: 'id', description: '官方目录中的数字 ID' })
  @ApiProduces('image/png', 'image/jpeg', 'image/gif', 'image/webp')
  @ApiOkResponse({ description: '官方图片原始二进制', schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: '目录条目不存在、无确认图片来源或图片暂不可用' })
  async collectionImage(@Param('kind') kind: string, @Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    return this.readImage(kind, id, undefined, response)
  }

  @Get('collection-images/:kind/:id/:heroId')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: '按角色 ID 与皮肤 ID 读取官方图片', description: '皮肤 ID 必须在官方目录中，角色须为官方式神或经验证的阴阳师皮肤组角色；支持本地历史记录，不依赖当前 API 进程是否查询过商品。' })
  @ApiParam({ name: 'kind', example: 'premiumSkins' })
  @ApiParam({ name: 'id', description: '官方目录中的皮肤 ID' })
  @ApiParam({ name: 'heroId', description: '官方商品详情皮肤元组中的角色 ID，含式神与阴阳师' })
  @ApiProduces('image/png')
  @ApiOkResponse({ description: '官方图片原始二进制', schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: '无经校验的官方皮肤来源或图片暂不可用' })
  async premiumSkinImage(@Param('kind') kind: string, @Param('id') id: string, @Param('heroId') heroId: string, @Res({ passthrough: true }) response: Response) {
    return this.readImage(kind, id, heroId, response)
  }

  private async readImage(kind: string, id: string, heroId: string | undefined, response: Response) {
    response.setHeader('Cache-Control', 'no-store')
    const image = await this.images.image(kind, id, heroId)
    response.setHeader('Cache-Control', 'public, max-age=3600')
    return image
  }

  @Get('static')
  @ApiOperation({ summary: '读取/更新式神、收藏、御魂套装和区服资料', description: '默认读取数据库静态快照，缺失时回退内置资料；refresh=true 时从固定官方脚本更新完整 JSON 和御魂目录，不覆盖手工维护的式神数据库目录/面板。收藏可含相对于 API 前缀的 imageUrl；无确认来源保持缺失。不伪造缺失式神面板，仅解析 JSON，不执行脚本。服务启动时若资料距上次同步已满 30 天，会在后台尝试月度刷新。' })
  @ApiOkResponse({ description: 'data: { heroes, heroCatalog, collections?, relicSuits, serverList, source, refreshedAt, heroBaseStatsSource, missingHeroIds }；收藏条目为 { name, description?, imageUrl? }。' })
  @ApiBadRequestResponse({ description: 'refresh 不是布尔文本或包含未知参数' })
  @ApiBadGatewayResponse({ description: '远程资料获取/校验失败，保留原缓存' })
  @ApiTooManyRequestsResponse({ description: '刷新冷却中（30 秒）' })
  staticData(@Query() query: StaticQueryDto) { return this.cbg.staticData(query.refresh) }
}
