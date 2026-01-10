/**
 * 大宗商品相关 API
 */
import axios from 'axios'
import dayjs from 'dayjs'

interface CommodityKlineData {
  dates: string[]
  prices: number[]
  latestPrice: number
  changePct: number
  name: string
  klines: number[][]
  volumes: number[][]
  isTrend: boolean
  preClose?: number
  avgPrices?: number[]
}

interface NewsItem {
  title: string
  url: string
  source: string
  time: string
}

/**
 * 获取期货K线数据
 */
export const fetchCommodityKline = async (
  code: string, 
  market: string, 
  period: '1m' | '3m' | '6m' | '1y' = '1y', 
  klineType: number = 101, 
  startDate?: string, 
  endDate?: string
): Promise<CommodityKlineData> => {
  try {
    if (!code || !market) return { dates: [], prices: [], latestPrice: 0, changePct: 0, name: '', klines: [], volumes: [], isTrend: false }

    let start: string, end: string
    
    if (startDate && endDate) {
      start = startDate
      end = endDate
    } else {
      const periodMap: Record<string, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }
      const months = periodMap[period] || 12
      start = dayjs().subtract(months, 'month').format('YYYYMMDD')
      end = dayjs().format('YYYYMMDD')
    }

    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}.${code}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=${klineType}&fqt=1&beg=${start}&end=${end}`
    
    const response = await axios.get(url)
    const rawData: string[] = response.data?.data?.klines || []
    const name = response.data?.data?.name || code

    const dates: string[] = []
    const prices: number[] = []
    const klines: number[][] = []
    const volumes: number[][] = []
    
    rawData.forEach((item, idx) => {
      const fields = item.split(',')
      const open = parseFloat(fields[1])
      const close = parseFloat(fields[2])
      const high = parseFloat(fields[3])
      const low = parseFloat(fields[4])
      const vol = parseFloat(fields[5]) || 0
      
      dates.push(fields[0])
      prices.push(close)
      klines.push([open, close, low, high])
      volumes.push([idx, vol, close >= open ? 1 : -1])
    })

    const latestPrice = prices[prices.length - 1] || 0
    const firstPrice = prices[0] || 0
    const changePct = firstPrice ? ((latestPrice - firstPrice) / firstPrice * 100) : 0

    return { dates, prices, latestPrice, changePct, name, klines, volumes, isTrend: false }
  } catch (error) {
    console.error('获取商品数据失败:', error)
    return { dates: [], prices: [], latestPrice: 0, changePct: 0, name: code, klines: [], volumes: [], isTrend: false }
  }
}

/**
 * 获取期货分时数据（当天）
 */
export const fetchCommodityTrend = async (code: string, market: string): Promise<CommodityKlineData> => {
  try {
    if (!code || !market) return { dates: [], prices: [], latestPrice: 0, changePct: 0, name: '', klines: [], volumes: [], isTrend: true }

    const timestamp = Date.now()
    
    if (market === '101') {
      const today = dayjs().format('YYYYMMDD')
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}.${code}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=1&fqt=1&beg=${today}&end=${today}&_=${timestamp}`
      
      const response = await axios.get(url)
      const data = response.data?.data
      
      if (!data || !data.klines?.length) {
        return fetchCommodityKline(code, market, '1m', 101)
      }
      
      const name = data.name || code
      const klines: string[] = data.klines || []
      
      const dates: string[] = []
      const prices: number[] = []
      const volumes: number[][] = []
      
      klines.forEach((item, idx) => {
        const fields = item.split(',')
        const time = fields[0].split(' ')[1] || fields[0]
        const close = parseFloat(fields[2])
        const open = parseFloat(fields[1])
        const vol = parseFloat(fields[5]) || 0
        dates.push(time)
        prices.push(close)
        volumes.push([idx, vol, close >= open ? 1 : -1])
      })
      
      const latestPrice = prices[prices.length - 1] || 0
      const firstPrice = prices[0] || latestPrice
      const changePct = firstPrice ? ((latestPrice - firstPrice) / firstPrice * 100) : 0
      
      return { 
        dates, 
        prices, 
        volumes,
        latestPrice, 
        changePct, 
        name, 
        preClose: firstPrice,
        klines: [], 
        isTrend: true 
      }
    }
    
    const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ut=7eea3edcaed734bea9cbfc24409ed989&ndays=1&iscr=0&secid=${market}.${code}&_=${timestamp}`
    
    const response = await axios.get(url)
    const data = response.data?.data
    
    if (!data || !data.trends?.length) {
      return fetchCommodityKline(code, market, '1m', 101)
    }
    
    const name = data.name || code
    const preClose = data.preClose
    const trends: string[] = data.trends || []
    
    const dates: string[] = []
    const prices: number[] = []
    const avgPrices: number[] = []
    const volumes: number[][] = []
    
    trends.forEach((item, idx) => {
      const fields = item.split(',')
      const time = fields[0].split(' ')[1] || fields[0]
      const price = parseFloat(fields[2])
      const avg = parseFloat(fields[7])
      const vol = parseFloat(fields[5]) || 0
      if (!isNaN(price) && price > 0) {
        dates.push(time)
        prices.push(price)
        if (!isNaN(avg)) avgPrices.push(avg)
        volumes.push([idx, vol, price >= preClose ? 1 : -1])
      }
    })
    
    if (prices.length === 0) {
      return fetchCommodityKline(code, market, '1m', 101)
    }
    
    const latestPrice = prices[prices.length - 1] || 0
    const changePct = preClose ? ((latestPrice - preClose) / preClose * 100) : 0
    
    return { 
      dates, 
      prices, 
      avgPrices: avgPrices.length === prices.length ? avgPrices : [],
      volumes,
      latestPrice, 
      changePct, 
      name, 
      preClose,
      klines: [], 
      isTrend: true 
    }
  } catch (error) {
    console.error('获取分时数据失败:', error)
    return fetchCommodityKline(code, market, '1m', 101)
  }
}

/**
 * 获取商品相关新闻（财经快讯）
 */
export const fetchCommodityNews = async (keyword: string): Promise<NewsItem[]> => {
  try {
    const timestamp = Date.now()
    // 使用东方财富财经快讯接口
    const url = `https://np-listapi.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_news_col&fastColumn=102&sortEnd=&pageIndex=1&pageSize=20&req_trace=${timestamp}`
    const response = await axios.get(url)
    const list = response.data?.data?.fastNewsList || []
    return list.map((item: any) => ({
      title: item.title || '',
      url: `https://finance.eastmoney.com/a/${item.code}.html`,
      source: '东方财富',
      time: item.showTime?.split(' ')[1] || item.showTime || ''
    }))
  } catch (error) {
    console.error('获取新闻失败:', error)
    return []
  }
}
