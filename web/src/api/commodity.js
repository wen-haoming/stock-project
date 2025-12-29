/**
 * 大宗商品相关 API
 */
import axios from 'axios'
import dayjs from 'dayjs'

/**
 * 获取期货K线数据
 * @param {string} code - 期货代码
 * @param {string} market - 市场代码
 * @param {string} period - 时间周期 '1m' | '3m' | '6m' | '1y'
 * @param {number} klineType - K线类型 101=日K, 102=周K, 103=月K
 */
export const fetchCommodityKline = async (code, market, period = '1y', klineType = 101) => {
  try {
    if (!code || !market) return { dates: [], prices: [], latestPrice: 0, changePct: 0, name: '', klines: [] }

    const periodMap = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }
    const months = periodMap[period] || 12
    const start = dayjs().subtract(months, 'month').format('YYYYMMDD')
    const end = dayjs().format('YYYYMMDD')

    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}.${code}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=${klineType}&fqt=1&beg=${start}&end=${end}`
    
    const response = await axios.get(url)
    const rawData = response.data?.data?.klines || []
    const name = response.data?.data?.name || code

    const dates = []
    const prices = []
    const klines = []
    
    rawData.forEach((item) => {
      const fields = item.split(',')
      dates.push(fields[0])
      prices.push(parseFloat(fields[2]))
      klines.push([
        parseFloat(fields[1]), // open
        parseFloat(fields[2]), // close
        parseFloat(fields[4]), // low
        parseFloat(fields[3]), // high
      ])
    })

    const latestPrice = prices[prices.length - 1] || 0
    const firstPrice = prices[0] || 0
    const changePct = firstPrice ? ((latestPrice - firstPrice) / firstPrice * 100) : 0

    return { dates, prices, latestPrice, changePct, name, klines }
  } catch (error) {
    console.error('获取商品数据失败:', error)
    return { dates: [], prices: [], latestPrice: 0, changePct: 0, name: code, klines: [] }
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
