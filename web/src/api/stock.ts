/**
 * 股票相关 API
 */
import axios from 'axios'
import dayjs from 'dayjs'
import type { KlineData, TrendData, NewsItem, FinanceData } from '../types'

interface TrendResponse {
  categoryData: string[]
  values: number[][]
  volumes: number[][]
  preClose: number
}

interface AnnouncementItem {
  title: string
  date: string
  code: string
  category: string
  url: string
  pdfUrl: string
}

interface AnnouncementResponse {
  list: AnnouncementItem[]
  total: number
}

interface StockInfo {
  symbol: string
  name: string
  industry: string
  latestPrice: number
  changePct: number
  changeAmt: number
  open: number
  high: number
  low: number
  preClose: number
  limitUp: number
  limitDown: number
  avgPrice: number
  volume: number
  amount: number
  outerVol: number
  innerVol: number
  totalMarketCap: number
  floatMarketCap: number
  totalShares: number
  floatShares: number
  peRatio: number      // 动态市盈率(TTM)
  peRatioStatic: number // 静态市盈率(LYR)
  pbRatio: number
  turnoverRate: number
  amplitude: number
  volumeRatio: number
  eps: number
  navps: number
  roe: number
}

/**
 * 获取分时数据
 */
export const fetchStockTrend = async (
  symbol: string, 
  market: 'a' | 'hk' | 'us' = 'hk', 
  ndays: number = 1
): Promise<TrendResponse> => {
  try {
    let secid: string
    if (market === 'a') {
      secid = symbol.startsWith('6') ? `1.${symbol}` : `0.${symbol}`
    } else if (market === 'us') {
      // 美股代码格式：105/106/107.SYMBOL
      secid = `105.${symbol}`
    } else {
      secid = `116.${symbol}`
    }
    
    const timestamp = Date.now()
    const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ut=7eea3edcaed734bea9cbfc24409ed989&ndays=${ndays}&iscr=0&secid=${secid}&_=${timestamp}`
    
    const response = await axios.get(url)
    const data = response.data?.data
    
    if (!data) return { categoryData: [], values: [], volumes: [], preClose: 0 }
    
    const preClose = data.preClose
    let trends: string[] = data.trends || []
    
    if (ndays === 1 && trends.length > 0) {
      const lastItem = trends[trends.length - 1]
      const latestDate = lastItem.split(',')[0]?.split(' ')[0]
      if (latestDate) {
        trends = trends.filter(item => {
          const dateStr = item.split(',')[0]?.split(' ')[0]
          return dateStr === latestDate
        })
      }
    }
    
    const categoryData: string[] = []
    const values: number[][] = []
    const volumes: number[][] = []
    
    let prevPrice = preClose
    let totalVolume = 0
    let totalAmount = 0
    const volumeMultiplier = market === 'a' ? 100 : 1
    
    trends.forEach((item, index) => {
      const fields = item.split(',')
      const time = fields[0].split(' ')[1] || fields[0]
      const price = parseFloat(fields[2])
      const volume = parseFloat(fields[5]) || 0
      const amount = parseFloat(fields[6]) || 0
      
      totalVolume += volume * volumeMultiplier
      totalAmount += amount
      const avgPrice = totalVolume > 0 ? totalAmount / totalVolume : price
      
      categoryData.push(time)
      values.push([price, avgPrice])
      volumes.push([index, volume, price >= prevPrice ? 1 : -1])
      prevPrice = price
    })
    
    return { categoryData, values, volumes, preClose }
  } catch (error) {
    console.error('获取分时数据失败:', error)
    return { categoryData: [], values: [], volumes: [], preClose: 0 }
  }
}

/**
 * 获取个股 K 线数据
 */
export const fetchStockKline = async (
  symbol: string, 
  market: 'a' | 'hk' | 'us' = 'hk', 
  months: number = 2, 
  period: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'day'
): Promise<KlineData> => {
  try {
    let actualMonths = months
    if (period === 'year') {
      actualMonths = Math.max(months, 240)
    } else if (period === 'quarter') {
      actualMonths = Math.max(months, 120)
    } else if (period === 'month') {
      actualMonths = Math.max(months, 60)
    } else if (period === 'week') {
      actualMonths = Math.max(months, 36)
    }
    
    const start = dayjs().subtract(actualMonths, 'month').format('YYYYMMDD')
    const end = dayjs().format('YYYYMMDD')
    
    let secid: string
    if (market === 'a') {
      secid = symbol.startsWith('6') ? `1.${symbol}` : `0.${symbol}`
    } else if (market === 'us') {
      secid = `105.${symbol}`
    } else {
      secid = `116.${symbol}`
    }
    
    const kltMap: Record<string, number> = { day: 101, week: 102, month: 103, quarter: 104, year: 105 }
    const klt = kltMap[period] || 101
    
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${klt}&fqt=1&beg=${start}&end=${end}`

    const response = await axios.get(url)
    const rawData: string[] = response.data?.data?.klines || []

    const categoryData: string[] = []
    const values: number[][] = []
    const volumes: number[][] = []

    rawData.forEach((item) => {
      const fields = item.split(',')
      categoryData.push(fields[0])
      const open = parseFloat(fields[1])
      const close = parseFloat(fields[2])
      const changePct = parseFloat(fields[8])
      const turnoverRate = parseFloat(fields[10])
      values.push([
        open, 
        close, 
        parseFloat(fields[4]), 
        parseFloat(fields[3]), 
        isNaN(changePct) ? 0 : changePct, 
        isNaN(turnoverRate) || turnoverRate < 0 ? 0 : turnoverRate
      ])
      volumes.push([categoryData.length - 1, parseInt(fields[5]), open > close ? 1 : -1])
    })

    return { categoryData, values, volumes }
  } catch (error) {
    console.error('获取个股K线失败:', error)
    return { categoryData: [], values: [], volumes: [] }
  }
}

/**
 * 获取个股新闻
 */
export const fetchStockNews = async (name: string): Promise<NewsItem[]> => {
  try {
    const response = await axios.get('/api/v1/stock/news', {
      params: { keyword: name }
    })
    const data = response.data
    return (data?.result?.cmsArticleWebOld || []).map((item: any) => ({
      title: item.title?.replace(/<\/?em>/g, ''),
      url: item.url,
      date: item.date,
      source: item.mediaName,
    }))
  } catch (error) {
    console.error('获取新闻失败:', error)
    return []
  }
}

/**
 * 获取A股公告列表
 */
export const fetchAnnouncements = async (
  symbol: string, 
  page: number = 1, 
  pageSize: number = 10, 
  category: string = '0'
): Promise<AnnouncementResponse> => {
  try {
    const response = await axios.get('/api/v1/stock/announcements', {
      params: { symbol, page, page_size: pageSize, category }
    })
    const data = response.data?.data || {}
    return {
      list: (data.list || []).map((item: any) => {
        let timestamp = Date.now()
        if (item.eiTime) {
          const eiTime = item.eiTime.replace(/:(\d{3})$/, '.$1')
          const date = new Date(eiTime)
          if (!isNaN(date.getTime())) {
            timestamp = date.getTime()
          }
        }
        const originalPdfUrl = `https://pdf.dfcfw.com/pdf/H2_${item.art_code}_1.pdf?${timestamp}.pdf`
        const pdfUrl = `/api/v1/stock/pdf?url=${encodeURIComponent(originalPdfUrl)}`
        
        return {
          title: item.title_ch || item.title,
          date: item.notice_date?.split(' ')[0] || '',
          code: item.art_code,
          category: item.columns?.[0]?.column_name || '',
          url: `https://data.eastmoney.com/notices/detail/${symbol}/${item.art_code}.html`,
          pdfUrl,
        }
      }),
      total: data.total_hits || 0,
    }
  } catch (error) {
    console.error('获取公告失败:', error)
    return { list: [], total: 0 }
  }
}

/**
 * 获取财务数据
 */
export const fetchFinanceData = async (
  symbol: string, 
  reportType: string = '', 
  market: 'a' | 'hk' | 'us' = 'hk'
): Promise<FinanceData[]> => {
  try {
    let url: string
    
    if (market === 'a') {
      const params = new URLSearchParams({
        sortColumns: 'REPORTDATE',
        sortTypes: '-1',
        pageSize: '50',
        pageNumber: '1',
        reportName: 'RPT_LICO_FN_CPD',
        columns: 'ALL',
        quoteColumns: '',
        source: 'WEB',
        client: 'DATACENTER_WEB',
        filter: `(SECURITY_CODE="${symbol}")`,
      })
      url = `https://datacenter-web.eastmoney.com/api/data/v1/get?${params.toString()}`
    } else if (market === 'us') {
      // 美股财务数据
      const params = new URLSearchParams({
        sortColumns: 'REPORT_DATE',
        sortTypes: '-1',
        pageSize: '50',
        pageNumber: '1',
        reportName: 'RPT_USF10_FN_GMAININDICATOR',
        columns: 'ALL',
        quoteColumns: '',
        source: 'SECURITIES',
        client: 'PC',
        filter: `(SECUCODE="${symbol}")`,
      })
      url = `https://datacenter.eastmoney.com/securities/api/data/v1/get?${params.toString()}`
    } else {
      const params = new URLSearchParams({
        sortColumns: 'REPORT_DATE',
        sortTypes: '-1',
        pageSize: '50',
        pageNumber: '1',
        reportName: 'RPT_HKF10_FN_MAININDICATOR',
        columns: 'ALL',
        quoteColumns: '',
        source: 'SECURITIES',
        client: 'PC',
        filter: `(SECUCODE="${symbol}.HK")`,
      })
      url = `https://datacenter.eastmoney.com/securities/api/data/v1/get?${params.toString()}`
    }
    
    const response = await axios.get(url)
    let result: any[] = response.data?.result?.data || []
    
    if (!result.length) return []
    
    const dateField = market === 'a' ? 'REPORTDATE' : 'REPORT_DATE'
    if (reportType) {
      const monthMap: Record<string, number> = { '1': 3, '2': 6, '3': 9, '4': 12 }
      const targetMonth = monthMap[reportType]
      if (targetMonth) {
        result = result.filter(item => {
          const month = dayjs(item[dateField]).month() + 1
          return month === targetMonth
        })
      }
    }
    
    if (market === 'a') {
      return result.map(item => {
        const reportDate = item.REPORTDATE || ''
        const date = dayjs(reportDate)
        const month = date.month() + 1
        const year = date.year()
        
        let periodLabel = ''
        if (month === 3) periodLabel = `${year}一季报`
        else if (month === 6) periodLabel = `${year}中报`
        else if (month === 9) periodLabel = `${year}三季报`
        else if (month === 12) periodLabel = `${year}年报`
        else periodLabel = date.format('YYYY-MM')
        
        const netProfit = item.PARENT_NETPROFIT ? item.PARENT_NETPROFIT / 100000000 : null
        const revenue = item.TOTAL_OPERATE_INCOME ? item.TOTAL_OPERATE_INCOME / 100000000 : null
        
        return {
          period: periodLabel,
          reportDate: reportDate,
          netProfit: netProfit,
          netProfitYoy: item.SJLTZ ?? null,
          revenue: revenue,
          revenueYoy: item.YSTZ ? item.YSTZ * 100 : null,
          grossProfit: null,
          grossProfitYoy: null,
          eps: item.BASIC_EPS ?? null,
          navps: item.BPS ?? null,
          npm: null,
          gpm: item.XSMLL ?? null,
          roe: item.WEIGHTAVG_ROE ?? null,
          dar: null,
        }
      }).reverse()
    }
    
    // 港股和美股使用相同的解析逻辑
    return result.map(item => {
      const reportDate = item.REPORT_DATE || ''
      const date = dayjs(reportDate)
      const month = date.month() + 1
      const year = date.year()
      
      let periodLabel = ''
      if (month === 3) periodLabel = `${year}一季报`
      else if (month === 6) periodLabel = `${year}中报`
      else if (month === 9) periodLabel = `${year}三季报`
      else if (month === 12) periodLabel = `${year}年报`
      else periodLabel = date.format('YYYY-MM')
      
      const netProfit = item.HOLDER_PROFIT ? item.HOLDER_PROFIT / 100000000 : null
      const revenue = item.OPERATE_INCOME ? item.OPERATE_INCOME / 100000000 : null
      const grossProfit = item.GROSS_PROFIT ? item.GROSS_PROFIT / 100000000 : null
      
      return {
        period: periodLabel,
        reportDate: reportDate,
        netProfit: netProfit,
        netProfitYoy: item.HOLDER_PROFIT_YOY ?? null,
        revenue: revenue,
        revenueYoy: item.OPERATE_INCOME_YOY ?? null,
        grossProfit: grossProfit,
        grossProfitYoy: item.GROSS_PROFIT_YOY ?? null,
        eps: item.BASIC_EPS ?? null,
        navps: item.BPS ?? null,
        npm: item.NET_PROFIT_RATIO ?? null,
        gpm: item.GROSS_PROFIT_RATIO ?? null,
        roe: item.ROE_AVG ?? null,
        dar: item.DEBT_ASSET_RATIO ?? null,
      }
    }).reverse()
  } catch (error) {
    console.error('获取财务数据失败:', error)
    return []
  }
}

/**
 * 获取股票基本信息
 */
export const fetchStockInfo = async (
  symbol: string, 
  name: string = '', 
  market: 'a' | 'hk' | 'us' = 'hk'
): Promise<StockInfo | null> => {
  try {
    let secid: string
    if (market === 'a') {
      const prefix = symbol.startsWith('6') ? '1' : '0'
      secid = `${prefix}.${symbol}`
    } else if (market === 'us') {
      secid = `105.${symbol}`
    } else {
      secid = `116.${symbol}`
    }
    
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f51,f52,f55,f57,f58,f60,f71,f100,f115,f116,f117,f162,f164,f167,f168,f169,f170,f173,f183,f184,f185,f186,f187,f188`
    const response = await axios.get(url)
    const data = response.data?.data
    
    if (!data) return null
    
    // 美股价格不需要除以100
    const priceDiv = market === 'a' ? 100 : market === 'us' ? 1 : 1000
    
    return {
      symbol: data.f57 || symbol,
      name: data.f58 || name,
      industry: data.f100 || '',
      latestPrice: data.f43 / priceDiv,
      changePct: data.f170 / 100,
      changeAmt: data.f169 / priceDiv,
      open: data.f46 / priceDiv,
      high: data.f44 / priceDiv,
      low: data.f45 / priceDiv,
      preClose: data.f60 / priceDiv,
      limitUp: data.f51 / priceDiv,
      limitDown: data.f52 / priceDiv,
      avgPrice: data.f71 / priceDiv,
      volume: data.f47,
      amount: data.f48,
      outerVol: data.f185,
      innerVol: data.f186,
      totalMarketCap: data.f116,
      floatMarketCap: data.f117,
      totalShares: data.f183,
      floatShares: data.f184,
      peRatio: data.f162 / 100,      // 动态市盈率(TTM)
      peRatioStatic: data.f115 / 100, // 静态市盈率(LYR)
      pbRatio: data.f167 / 100,
      turnoverRate: data.f168 / 100,
      amplitude: data.f50 / 100,
      volumeRatio: data.f55 / 100,
      eps: data.f187 / 100,
      navps: data.f188 / 100,
      roe: data.f173 / 100,
    }
  } catch (error) {
    console.error('获取股票信息失败:', error)
    return name ? { symbol, name } as StockInfo : null
  }
}

/**
 * 搜索股票
 */
export const searchStocks = async (keyword: string, limit: number = 20) => {
  try {
    const response = await axios.get('/api/v1/stock/search', {
      params: { keyword, limit }
    })
    return response.data
  } catch (error) {
    console.error('搜索股票失败:', error)
    return { code: -1, data: [] }
  }
}
