import crypto from 'crypto'
import InitChrome from './init'
import { common } from '@Common'
import { Render, RenderResult, screenshot } from './core'
import { PuppeteerLaunchOptions } from 'puppeteer-core'

export interface RunConfig extends PuppeteerLaunchOptions {
  /**
   * 使用的浏览器版本
   * @default 125.0.6422.78
   */
  version?: string
  /**
   * 启动浏览器数量
   * @default 1
   */
  browserCount?: number
  /**
   * 传递给浏览器实例的其他命令行参数
   */
  args?: string[]
  /**
   * 指定要使用的调试端口号
   */
  debuggingPort?: number
  /**
   * 是否为每个选项卡自动打开 DevTools 面板。如果设置为 true，则 headless 将被强制为 false
   */
  devtools?: boolean
  /**
   * 资源根目录
   */
  dir?: string
  /**
   * 通过管道而不是 WebSocket 连接到浏览器。在大多数情况下，这将导致更快的页面加载。
   */
  pipe?: boolean
}

/**
 * @description Puppeteer多浏览器实例管理
 */
export class Puppeteer {
  /** 浏览器id索引 */
  index: number
  /** 浏览器实例列表 */
  list: Render[]
  /** 实例管理器配置 初始化的时候传递 */
  config: RunConfig
  /** 启动浏览器的参数 初始化后才产生 */
  browserOptions: PuppeteerLaunchOptions
  constructor (config?: RunConfig) {
    this.index = 0
    this.list = []
    this.config = config || {
      pipe: true,
      headless: true,
      devtools: false,
      args: [
        '--enable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--no-zygote',
        '--disable-extensions',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
        '--force-device-scale-factor=2',
      ],
    }
    this.browserOptions = this.config
  }

  async init () {
    /** 用户设置的资源根目录 */
    if (this.config.dir) common.dir = this.config.dir

    /** 浏览器执行路径 */
    if (!this.config?.executablePath) {
      const version = this.config.version || '125.0.6422.78'
      const init = new InitChrome(version)
      const executablePath = await init.init()
      this.browserOptions.executablePath = executablePath
    }

    /** 用户数据存储路径 */
    if (!this.config?.userDataDir) {
      this.browserOptions.userDataDir = common.dir + '/data/userDataDir'
    }

    /** 监听浏览器关闭事件 移除浏览器实例 */
    common.on('browserCrash', (id) => {
      const index = this.list.findIndex(item => item.id === id)
      if (index !== -1) this.list.splice(index, 1)
      /** 新开浏览器 */
      this.launch()
    })

    const browserCount = this.config.browserCount || 1

    delete this.config.browserCount

    for (let i = 0; i < browserCount; i++) {
      await this.launch()
    }
    console.info('[chrome] 初始化完成~')
    return this
  }

  /**
   * 启动浏览器
   */
  async launch () {
    const browser = new Render(this.index++, this.browserOptions)
    await browser.init()
    this.list.push(browser)
    return this
  }

  /**
   * 截图
   * @param options 截图参数
   * @returns 截图结果
   */
  async screenshot<T extends screenshot> (options: T): Promise<RenderResult<T>> {
    /** 第一次 */
    const result = await this.task(options)
    if (Array.isArray(result) || Buffer.isBuffer(result)) return result

    /** 第二次 */
    console.error('[chrome] 第一次截图失败，正在重试~')
    return await this.task(options)
  }

  /**
   * 调用浏览器实例截图
   * @param options - 截图参数
   * @returns 截图结果
   */
  async task<T extends screenshot> (options: T): Promise<RenderResult<T>> {
    /** 生成唯一id */
    const id = crypto.randomUUID()
    /** 将第一个浏览器实例放到最后 */
    const browser = this.list.shift()
    const image = browser!.render(id, options)
    if (browser) this.list.push(browser)
    return image
  }
}
