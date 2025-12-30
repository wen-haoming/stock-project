/**
 * 大宗商品相关 API
 */
import axios from 'axios'
import dayjs from 'dayjs'

/**
 * 获取期货K线数据
 * @param {string} code - 期货代码
 * @param {string} market - 市场代码
 * @param {string} period - 时间周期 '1m' | '3m' | '6m' | '1y'（可选，如果提供 startDate/endDate 则忽略）
 * @param {number} klineType - K线类型 101=日K, 102=周K, 103=月K
 * @param {string} startDate - 开始日期 YYYYMMDD
 * @param {string} endDate - 结束日期 YYYYMMDD
 */
export const fetchCommodityKline = async (code, market, period = '1y', klineType = 101, startDate, endDate) => {
  try {
    if (!code || !market) return { dates: [], prices: [], latestPrice: 0, changePct: 0, name: '', klines: [], volumes: [], isTrend: false }

    let start, end
    
    if (startDate && endDate) {
      // 使用传入的日期范围
      start = startDate
      end = endDate
    } else {
      // 使用 period 计算日期范围
      const periodMap = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }
      const months = periodMap[period] || 12
      start = dayjs().subtract(months, 'month').format('YYYYMMDD')
      end = dayjs().format('YYYYMMDD')
    }

    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}.${code}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=${klineType}&fqt=1&beg=${start}&end=${end}`
    
    const response = await axios.get(url)
    const rawData = response.data?.data?.klines || []
    const name = response.data?.data?.name || code

    const dates = []
    const prices = []
    const klines = []
    const volumes = []
    
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
      // 成交量：[index, volume, direction] direction: 1=涨, -1=跌
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
 * @param {string} code - 期货代码
 * @param {string} market - 市场代码
 */
export const fetchCommodityTrend = async (code, market) => {
  try {
    if (!code || !market) return { dates: [], prices: [], latestPrice: 0, changePct: 0, name: '', klines: [], volumes: [], isTrend: true }

    const timestamp = Date.now()
    
    // 国际期货（market=101）使用不同的分时接口
    if (market === '101') {
      // 国际期货使用1分钟K线模拟分时
      const today = dayjs().format('YYYYMMDD')
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}.${code}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=1&fqt=1&beg=${today}&end=${today}&_=${timestamp}`
      
      const response = await axios.get(url)
      const data = response.data?.data
      
      if (!data || !data.klines?.length) {
        // 如果当天无数据，返回最近的日K数据
        return fetchCommodityKline(code, market, '1m', 101)
      }
      
      const name = data.name || code
      const klines = data.klines || []
      
      const dates = []
      const prices = []
      const volumes = []
      
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
    
    // 国内期货使用分时接口
    const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ut=7eea3edcaed734bea9cbfc24409ed989&ndays=1&iscr=0&secid=${market}.${code}&_=${timestamp}`
    
    const response = await axios.get(url)
    const data = response.data?.data
    
    if (!data || !data.trends?.length) {
      // 如果分时数据为空（非交易时间），返回最近的日K数据
      return fetchCommodityKline(code, market, '1m', 101)
    }
    
    const name = data.name || code
    const preClose = data.preClose
    const trends = data.trends || []
    
    const dates = []
    const prices = []
    const avgPrices = []
    const volumes = []
    
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
      // 如果解析后无有效数据，返回最近的日K数据
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
    // 出错时返回最近的日K数据
    return fetchCommodityKline(code, market, '1m', 101)
  }
}

/**
 * 获取商品相关新闻
 * @param {string} keyword - 搜索关键词
 */
export const fetchCommodityNews = async (keyword) => {
  try {
    const url = `https://searchapi.eastmoney.com/api/Info/Search?appkey=796d6e5f5765626368617432303135&pageindex=1&pagesize=10&keyword=${encodeURIComponent(keyword)}&type=1`
    const response = await axios.get(url)
    const list = response.data?.Data?.List || []
    return list.map(item => ({
      title: item.Title?.replace(/<[^>]+>/g, '') || '',
      url: item.Url || '',
      source: item.Source || '东方财富',
      time: item.Date || ''
    }))
  } catch (error) {
    console.error('获取新闻失败:', error)
    return []
  }
}
