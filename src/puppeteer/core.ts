import { common } from '@Common'
import { ChildProcess } from 'child_process'
import puppeteer, { Browser, GoToOptions, HTTPRequest, Page, PuppeteerLaunchOptions, ScreenshotOptions } from 'puppeteer-core'

export interface screenshot extends ScreenshotOptions {
  /** http地址或本地文件路径 */
  file: string
  /**
 * 选择的元素截图
 * fullPage为false时生效
 * 如果未找到指定元素则使用body
 * @default 'body'
 */
  selector?: string
  /** 截图类型 默认'jpeg' */
  type?: 'png' | 'jpeg' | 'webp'
  /**
   * 截图质量 默认90
   * @default 90
   */
  quality?: number
  /**
   * - 额外的 HTTP 头信息将随页面发起的每个请求一起发送
   * - 标头值必须是字符串
   * - 所有 HTTP 标头名称均小写。(HTTP 标头不区分大小写，因此这不会影响服务器代码）。
   */
  headers?: Record<string, string>
  /**
   * 截图整个页面
   * @default false
   */
  fullPage?: boolean
  /**
   * 控制截图的优化速度
   * @default false
   */
  optimizeForSpeed?: boolean
  /**
   * 截图后的图片编码
   * @default 'binary'
   */
  encoding?: 'base64' | 'binary'
  /** 保存图片的文件路径 */
  path?: string
  /**
   * 是否隐藏背景
   * @default false
   */
  omitBackground?: boolean
  /**
   * 捕获视口之外的屏幕截图
   * @default false
   */
  captureBeyondViewport?: boolean
  /** 设置视窗大小和设备像素比 */
  setViewport?: {
    /** 视窗宽度 */
    width?: number
    /** 视窗高度 */
    height?: number
    /**
     * 设备像素比
     * @default 1
     */
    deviceScaleFactor?: number
  }
  /** 分页截图 传递数字则视为视窗高度 返回数组 */
  multiPage?: number | boolean
  /** 页面goto时的参数 */
  pageGotoParams?: GoToOptions,
  /** 等待指定元素加载完成 */
  waitForSelector?: string | string[]
  /** 等待特定函数完成 */
  waitForFunction?: string | string[]
  /** 等待特定请求完成 */
  waitForRequest?: string | string[]
  /** 等待特定响应完成 */
  waitForResponse?: string | string[]
  /** 请求拦截 */
  setRequestInterception?: (HTTPRequest: HTTPRequest, data: screenshot) => void
}

export interface screenshotRes {
  status: 'ok' | 'fail'
  data: string | string[] | Buffer | Buffer[] | Error
}

/** 截图返回 */
export type RenderResult<T extends screenshot> = T['multiPage'] extends true | number ? Buffer[] : Buffer

export class Render {
  /** 浏览器id */
  id: number
  /** 浏览器启动配置 */
  config: PuppeteerLaunchOptions
  /** 浏览器实例 */
  browser!: Browser
  /** 截图队列 存放每个任务的唯一标识 */
  list: Map<string, any>
  /** 浏览器进程 */
  process!: ChildProcess | null
  constructor (id: number, config: PuppeteerLaunchOptions) {
    this.id = id
    this.config = config
    this.list = new Map()
  }

  /**
   * 初始化启动浏览器
   */
  async init () {
    /** 启动浏览器 */
    this.browser = await puppeteer.launch(this.config)
    /** 浏览器id */
    this.process = this.browser.process()

    /** 监听浏览器关闭事件 移除浏览器实例 */
    this.browser.on('disconnected', () => {
      console.error(`[浏览器][${this.id}] 已关闭或崩溃`)

      /** 传递一个浏览器崩溃事件出去 用于在浏览器池子中移除掉当前浏览器 */
      common.emit('browserCrash', this.id)
      /** 尝试关闭 */
      this.browser?.close && this.browser.close().catch(() => { })
      /** 如果pid存在 再使用node自带的kill杀一次 */
      this.process?.pid && process.kill(this.process.pid)
    })
  }

  /**
   * 截图
   * @param echo 唯一标识
   * @param data 截图参数
   * @returns 截图结果
   */
  async render<T extends screenshot> (echo: string, data: T): Promise<RenderResult<T>> {
    try {
      this.list.set(echo, true)
      /** 创建页面 */
      const page = await this.page(data)

      const options = {
        path: data.path,
        type: data.type || 'jpeg',
        quality: data.quality || 90 as number | undefined,
        fullPage: data.fullPage || false,
        optimizeForSpeed: data.optimizeForSpeed || false,
        encoding: data.encoding || 'binary',
        omitBackground: data.omitBackground || false,
        captureBeyondViewport: data.captureBeyondViewport || false,
      }

      /** 如果是png并且有quality则删除quality */
      if (options.quality && data.type === 'png') options.quality = undefined

      /** 整个页面截图 */
      if (data.fullPage) {
        options.captureBeyondViewport = true
        const uint8Array = await page.screenshot(options)
        await this.setViewport(page, data?.setViewport?.width, data?.setViewport?.height, data?.setViewport?.deviceScaleFactor)
        this.screenshot(page)
        return Buffer.from(uint8Array) as RenderResult<T>
      }

      /** 获取页面元素 */
      const body = await this.elementHandle(page, data.selector)
      /** 计算页面高度 */
      const box = await body!.boundingBox()

      await this.setViewport(page,
        data?.setViewport?.width || box?.width,
        data?.setViewport?.height || box?.height,
        data?.setViewport?.deviceScaleFactor
      )

      /** 指定元素截图 */
      if (!data.multiPage) {
        /** 截图 */
        const uint8Array = await page.screenshot(options)

        this.screenshot(page)
        return Buffer.from(uint8Array) as RenderResult<T>
      }

      /** 分页截图 */
      const list: Buffer[] = []
      const boxWidth = box?.width ?? 1200
      const boxHeight = box?.height ?? 2000

      /** 高度 不传参则为2000 */
      const height = typeof data.multiPage === 'number' ? data.multiPage : (boxHeight >= 2000 ? 2000 : boxHeight)
      /** 分页数量 */
      const count = Math.ceil(boxHeight / height)

      for (let i = 0; i < count; i++) {
        /** 计算截图位置 */
        let y = i * height
        /** 计算截图高度 */
        let clipHeight = Math.min(height, boxHeight - i * height)
        /** 第二页开始y-100 */
        if (i !== 0) {
          y -= 100
          clipHeight += 100
        }

        /** 截图位置 */
        data.clip = { x: 0, y, width: boxWidth, height: clipHeight }
        const uint8Array = await body!.screenshot(data)
        const buffer = Buffer.from(uint8Array)
        list.push(buffer)
      }

      return list as RenderResult<T>
    } finally {
      /** 从队列中去除 */
      this.list.delete(echo)
    }
  }

  /**
   * 初始化页面
   * @param data 截图参数
   */
  async page (data: screenshot) {
    /** 创建页面 */
    const page = await this.browser.newPage()

    /** 请求拦截处理 */
    if (typeof data.setRequestInterception === 'function') {
      await page.setRequestInterception(true)
      page.on('request', (req) => data.setRequestInterception!(req, data))
    }

    /** 打开页面数+1 */
    common.emit('newPage', this.id)

    /** 设置HTTP 标头 */
    if (data.headers) await page.setExtraHTTPHeaders(data.headers)

    /** 加载页面 */
    await page.goto(data.file, data.pageGotoParams)

    /** 等待body加载完成 */
    await page.waitForSelector('body')

    /** 等待指定元素加载完成 */
    if (data.waitForSelector) {
      if (!Array.isArray(data.waitForSelector)) data.waitForSelector = [data.waitForSelector]
      for (const selector of data.waitForSelector) {
        await page.waitForSelector(selector).catch(() => { })
      }
    }

    /** 等待特定函数完成 */
    if (data.waitForFunction) {
      if (!Array.isArray(data.waitForFunction)) data.waitForFunction = [data.waitForFunction]
      for (const func of data.waitForFunction) {
        await page.waitForFunction(func).catch(() => { })
      }
    }

    /** 等待特定请求完成 */
    if (data.waitForRequest) {
      if (!Array.isArray(data.waitForRequest)) data.waitForRequest = [data.waitForRequest]
      for (const req of data.waitForRequest) {
        await page.waitForRequest(req).catch(() => { })
      }
    }

    /** 等待特定响应完成 */
    if (data.waitForResponse) {
      if (!Array.isArray(data.waitForResponse)) data.waitForResponse = [data.waitForResponse]
      for (const res of data.waitForResponse) {
        await page.waitForResponse(res).catch(() => { })
      }
    }

    return page
  }

  /**
   * 获取页面元素
   * @param page 页面实例
   * @param name 元素名称
   */
  async elementHandle (page: Page, name?: string) {
    try {
      if (name) {
        const element = await page.$(name) || await page.$('body') || await page.$('#container')
        return element
      }
      const element = await page.$('body') || await page.$('#container')
      return element
    } catch (err) {
      return await page.$('body') || await page.$('#container')
    }
  }

  /**
   * 生成图片次数+1 并关闭页面
   * @param page 页面实例
   */
  async screenshot (page: Page) {
    common.emit('screenshot', this.id)
    await page.close().catch(() => { })
  }

  /**
   * 设置视窗大小
   * @param page 页面实例
   * @param width 视窗宽度
   * @param height 视窗高度
   */
  async setViewport (page: Page, width?: number, height?: number, deviceScaleFactor?: number) {
    if (!width && !height && !deviceScaleFactor) return
    const setViewport = {
      width: Math.round(width || 1920),
      height: Math.round(height || 1080),
      deviceScaleFactor: Math.round(deviceScaleFactor || 1),
    }
    await page.setViewport(setViewport)
  }
}
