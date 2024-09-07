import fs from 'fs'
import os from 'os'
import { common, Platform } from '@Common'

export interface Info {
  /**
   * 根路径 也就是解压路径
   */
  dir: string
  /**
   * 下载后zip存放路径
   */
  zip: string
  /**
   * chrome文件夹根路径
   */
  chromeDir: string
  /**
   * chrome二进制路径
   */
  chrome: string
}

/**
 * Chrome下载地址枚举
 */
export const enum ChromeUrl {
  Cnpm = 'https://cdn.npmmirror.com/binaries/chrome-for-testing',
  Google = 'https://storage.googleapis.com/chrome-for-testing-public',
}

export default class InitChrome {
  /**
   * @param version - 传入下载的chrome版本
   */
  version: string
  platform: Platform
  info: Info
  constructor (version: string) {
    this.version = version
    /** 获取系统版本 */
    this.platform = common.Platform()
    this.info = this.GetInfo()
  }

  /**
   * 初始化
   * @returns
   */
  async init (): Promise<string> {
    /** 判断是否存在chrome */
    if (common.exists(this.info.chrome)) {
      console.info(`[chrome] ${this.info.chrome}`)
      return this.info.chrome
    }

    /** 下载chrome */
    const url = await this.GetDownloadUrl()

    /** 检查zip是否已存在 已存在删除 */
    if (common.exists(this.info.zip)) fs.unlinkSync(this.info.zip)

    const downloadRes = await common.download(url, this.info.zip)
    if (!downloadRes) throw new Error('[chrome][init] 下载失败')

    console.info('[chrome][init] 下载完成，开始解压')
    const unzipRes = await common.unzip(this.info.zip, this.info.dir)
    if (!unzipRes) throw new Error('[chrome][init] 解压失败')
    /** 解压完成删除zip文件 */
    fs.unlinkSync(this.info.zip)
    console.info('[chrome][init] 解压完成: ', this.info.chrome)

    /** linux需要先安装环境 */
    if (os.platform() === 'linux') {
      console.log('[chrome][init] 当前为Linux系统，正在初始化环境...')
      await this.install()
    }

    return this.info.chrome
  }

  /**
   * 安装环境
   */
  async install (): Promise<void> {
    const CentOS = [
      'alsa-lib.x86_64',
      'atk.x86_64',
      'cups-libs.x86_64',
      'gtk3.x86_64',
      'ipa-gothic-fonts',
      'libXcomposite.x86_64',
      'libXcursor.x86_64',
      'libXdamage.x86_64',
      'libXext.x86_64',
      'libXi.x86_64',
      'libXrandr.x86_64',
      'libXScrnSaver.x86_64',
      'libXtst.x86_64',
      'pango.x86_64',
      'xorg-x11-fonts-100dpi',
      'xorg-x11-fonts-75dpi',
      'xorg-x11-fonts-cyrillic',
      'xorg-x11-fonts-misc',
      'xorg-x11-fonts-Type1',
      'xorg-x11-utils',
    ]

    const Debian = [
      'ca-certificates',
      'fonts-liberation',
      'libasound2',
      'libatk-bridge2.0-0',
      'libatk1.0-0',
      'libc6',
      'libcairo2',
      'libcups2',
      'libdbus-1-3',
      'libexpat1',
      'libfontconfig1',
      'libgbm1',
      'libgcc1',
      'libglib2.0-0',
      'libgtk-3-0',
      'libnspr4',
      'libnss3',
      'libpango-1.0-0',
      'libpangocairo-1.0-0',
      'libstdc++6',
      'libx11-6',
      'libx11-xcb1',
      'libxcb1',
      'libxcomposite1',
      'libxcursor1',
      'libxdamage1',
      'libxext6',
      'libxfixes3',
      'libxi6',
      'libxrandr2',
      'libxrender1',
      'libxss1',
      'libxtst6',
      'lsb-release',
      'wget',
      'xdg-utils',
    ]

    /** 获取当前的系统 */
    const system = await common.exec('cat /etc/os-release').catch(() => '') as string

    if (/centos/i.test(system)) {
      await common.exec(`yum install -y ${CentOS.join(' ')}`)
      await common.exec('yum update nss -y')
    } else if (/debian|ubuntu/i.test(system)) {
      await common.exec(`apt-get install -y ${Debian.join(' ')}`)
    } else {
      console.error(`[Error] 未知系统: ${system} 请自行处理 Chrome 依赖`)
      return
    }
    console.log('[chrome][init] 环境初始化完成')
  }

  /**
   * 获取下载地址
   */
  async GetDownloadUrl (host: ChromeUrl = ChromeUrl.Cnpm): Promise<string> {
    try {
      /** 组合url */
      const url = `${host}/${this.version}/${this.platform}/chrome-headless-shell-${this.platform}.zip`
      console.info(`[chrome][init] 获取下载地址完成：${url}`)
      return url
    } catch (e) {
      if (host === ChromeUrl.Google) {
        console.error('[chrome][init] 谷歌源获取失败，无法下载，请检查网络连接')
        console.error(e)
        process.exit()
      }

      /** 如果下阿里云失败 则尝试走谷歌源 */
      console.error('[chrome][init] 阿里云源获取失败，正在尝试谷歌源进行下载...')
      console.error(e)
      return this.GetDownloadUrl(ChromeUrl.Google)
    }
  }

  /**
   * 获取chrome信息
   */
  GetInfo (): Info {
    /**
     * 版本
     */
    const version = `chrome-headless-shell-${this.platform}`

    /**
     * 根路径 也就是解压路径
     */
    const dir = `${common.dir}/data/chromium`

    /**
     * 下载后zip存放路径
     */
    const zip = `${dir}/${version}.zip`

    /**
     * chrome文件夹根路径
     */
    const chromeDir = `${dir}/${version}`

    /**
     * chrome二进制路径
     */
    const chrome = `${chromeDir}/chrome-headless-shell${this.platform === 'win64' ? '.exe' : ''}`

    return {
      dir,
      zip,
      chromeDir,
      chrome,
    }
  }
}
