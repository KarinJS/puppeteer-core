import fs from 'fs'
import Puppeteer from '../lib/index.js'

// 使用示例
const chrome = new Puppeteer({ chrome: 'chrome', headless: false })

await chrome.init()

await new Promise((resolve) => setTimeout(resolve, 1000))

const screenshot = async () => {
  /** 计算耗时 */
  console.time('截图耗时')
  const image = await chrome.screenshot({
    file: 'file://D:/QQBot/karin-puppeteer-core/test/test.html',
    encoding: 'base64',
    type: 'png',
  })

  console.timeEnd('截图耗时')
  fs.writeFileSync('image.png', Buffer.from(image, 'base64'))
}

// 监听控制台输出 输入p则截图
process.stdin.on('data', async (data) => {
  console.log(data.toString().trim())
  if (data.toString().trim() === 'p') {
    await screenshot()
  }
})
