import fs from 'fs'
import os from 'os'
import path from 'path'
import https from 'https'
import { promisify } from 'util'
import { pipeline } from 'stream'
import decompress from 'decompress'
import { fileURLToPath } from 'url'
import { exec as execCmd, ExecOptions } from 'child_process'
import { EventEmitter } from 'events'

const streamPipeline = promisify(pipeline)

export type Platform = 'linux64' | 'mac-arm64' | 'mac-x64' | 'win32' | 'win64'

export class Common extends EventEmitter {
  /**
   * 项目根目录
   */
  dir: string
  constructor () {
    super()
    this.dir = this.pathDir()
  }

  /**
   * 判断路径是否存在
   */
  exists (path: string): boolean {
    return fs.existsSync(path)
  }

  /**
   * 递归创建路径
   * @param dirname - 文件夹路径
   */
  mkdirs (dirname: string): boolean {
    if (fs.existsSync(dirname)) return true
    if (this.mkdirs(path.dirname(dirname))) {
      fs.mkdirSync(dirname)
      return true
    }
    return true
  }

  /**
   * 获取项目根目录
   * @returns 项目根目录
   */
  pathDir (): string {
    if (process.env.KarinPuppeteerDir) return process.env.KarinPuppeteerDir
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const dir = path.join(__dirname, '../..').replace(/\\/g, '/')
    return dir
  }

  /**
   * 获取系统版本
   * @returns linux64、mac-arm64、mac-x64、win32、win64
   */
  Platform (): Platform {
    switch (process.platform) {
      case 'linux': {
        return 'linux64'
      }
      case 'darwin': {
        const platform = os.arch() === 'arm64' ? 'mac-arm64' : 'mac-x64'
        return platform
      }
      case 'win32': {
        const platform = os.arch() === 'x64' ? 'win64' : 'win32'
        return platform
      }
      default: {
        throw new Error('不支持的系统')
      }
    }
  }

  /**
   * 网络探针
   * @param url - 探测地址
   * @param timeout - 超时时间 默认2000ms
   * @returns 是否可访问
   */
  async ping (url: string, timeout: number = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      const request = https.get(url, (res) => {
        resolve(res.statusCode === 200)
      })

      request.on('error', () => {
        resolve(false)
      })

      request.setTimeout(timeout, () => {
        request.abort()
        resolve(false)
      })
    })
  }

  /**
   * 下载保存文件
   * @param url 下载文件地址
   * @param file 保存绝对路径
   * @param params fetch参数
   */
  async download (url: string, file: string, params: https.RequestOptions = {}): Promise<boolean> {
    try {
      this.mkdirs(path.dirname(file))
      console.info(`[下载文件] ${url}`)

      return new Promise((resolve, reject) => {
        const request = https.get(url, params, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Failed to get '${url}' (${res.statusCode})`))
            return
          }

          const fileStream = fs.createWriteStream(file)
          streamPipeline(res, fileStream)
            .then(() => resolve(true))
            .catch((err) => {
              console.error(`[下载文件] 错误：${err}`)
              resolve(false)
            })
        })

        request.on('error', (err) => {
          console.error(`[下载文件] 错误: ${err}`)
          resolve(false)
        })
      })
    } catch (err) {
      console.error(`[下载文件] 错误: ${err}`)
      return false
    }
  }

  /**
   * 解压文件
   * @param file zip文件路径
   * @param output 输出路径
   */
  async unzip (file: string, output: string) {
    try {
      console.info(`[解压文件] ${file}`)
      await decompress(file, output)
      return true
    } catch (err) {
      console.error(`[解压文件] 错误：${err}`)
      return false
    }
  }

  /**
   * 封装exec
   * @param cmd - 命令
   */
  exec (cmd: string, options?: ExecOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      execCmd(cmd, options, (error, stdout, stderr) => {
        if (stdout) return resolve(stdout.toString().trim())
        if (error) return reject(error)
        return reject(stderr)
      })
    })
  }
}

export const common = new Common()
