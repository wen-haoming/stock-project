/**
 * 股票相关 API
 */
import axios from 'axios'
import dayjs from 'dayjs'

/**
 * 获取个股 K 线数据
 * @param {string} symbol - 股票代码
 * @param {string} market - 市场类型 'a' | 'hk'
 * @param {number} years - 获取年数，默认3年
 */
export const fetchStockKline = async (symbol, market = 'hk', years = 3) => {
  try {
    const start = dayjs().subtract(years, 'year').format('YYYYMMDD')
    const end = dayjs().format('YYYYMMDD')
    
    // 根据市场类型构建 secid
    let secid
    if (market === 'a') {
      secid = symbol.startsWith('6') ? `1.${symbol}` : `0.${symbol}`
    } else {
      secid = `116.${symbol}`
    }
    
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${start}&end=${end}`

    const response = await axios.get(url)
    const rawData = response.data?.data?.klines || []

    const categoryData = []
    const values = []
    const volumes = []

    rawData.forEach((item) => {
      const fields = item.split(',')
      categoryData.push(fields[0])
      const open = parseFloat(fields[1])
      const close = parseFloat(fields[2])
      values.push([open, close, parseFloat(fields[4]), parseFloat(fields[3])])
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
 * @param {string} name - 股票名称
 */
export const fetchStockNews = async (name) => {
  try {
    const response = await axios.get('/api/v1/stock/news', {
      params: { keyword: name }
    })
    const data = response.data
    return (data?.result?.cmsArticleWebOld || []).map(item => ({
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
 * @param {string} symbol - 股票代码
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {string} category - 分类
 */
export const fetchAnnouncements = async (symbol, page = 1, pageSize = 10, category = '0') => {
  try {
    const response = await axios.get('/api/v1/stock/announcements', {
      params: { symbol, page, page_size: pageSize, category }
    })
    const data = response.data?.data || {}
    return {
      list: (data.list || []).map(item => {
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
 * @param {string} symbol - 股票代码
 * @param {string} reportType - 报告类型 '' | '2' | '4'
 * @param {string} market - 市场类型 'a' | 'hk'
 */
export const fetchFinanceData = async (symbol, reportType = '', market = 'hk') => {
  try {
    let url
    
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
    let result = response.data?.result?.data || []
    
    if (!result.length) return []
    
    // 根据报告类型过滤
    const dateField = market === 'a' ? 'REPORTDATE' : 'REPORT_DATE'
    if (reportType) {
      const monthMap = { '1': 3, '2': 6, '3': 9, '4': 12 }
      const targetMonth = monthMap[reportType]
      if (targetMonth) {
        result = result.filter(item => {
          const month = dayjs(item[dateField]).month() + 1
          return month === targetMonth
        })
      }
    }
    
    // A股字段映射
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
    
    // 港股字段映射
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
 * @param {string} symbol - 股票代码
 * @param {string} name - 股票名称（备用）
 * @param {string} market - 市场类型 'a' | 'hk'
 */
export const fetchStockInfo = async (symbol, name = '', market = 'hk') => {
  try {
    let secid
    if (market === 'a') {
      const prefix = symbol.startsWith('6') ? '1' : '0'
      secid = `${prefix}.${symbol}`
    } else {
      secid = `116.${symbol}`
    }
    
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f51,f52,f55,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170`
    const response = await axios.get(url)
    const data = response.data?.data
    
    if (!data) return null
    
    const priceDiv = market === 'a' ? 100 : 1000
    
    return {
      symbol: data.f57 || symbol,
      name: data.f58 || name,
      latestPrice: data.f43 / priceDiv,
      changePct: data.f170 / 100,
      changeAmt: data.f169 / priceDiv,
      open: data.f46 / priceDiv,
      high: data.f44 / priceDiv,
      low: data.f45 / priceDiv,
      preClose: data.f60 / priceDiv,
      volume: data.f47,
      amount: data.f48,
      totalMarketCap: data.f116,
      floatMarketCap: data.f117,
      peRatio: data.f162 / 100,
      pbRatio: data.f167 / 100,
      turnoverRate: data.f168 / 100,
      amplitude: data.f50 / 100,
      volumeRatio: data.f55 / 100,
    }
  } catch (error) {
    console.error('获取股票信息失败:', error)
    return name ? { symbol, name } : null
  }
}
