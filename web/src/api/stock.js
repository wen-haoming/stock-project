/**
 * 股票相关 API
 */
import axios from 'axios'
import dayjs from 'dayjs'

/**
 * 获取分时数据
 * @param {string} symbol - 股票代码
 * @param {string} market - 市场类型 'a' | 'hk'
 * @param {number} ndays - 天数 1-5
 */
export const fetchStockTrend = async (symbol, market = 'hk', ndays = 1) => {
  try {
    let secid
    if (market === 'a') {
      secid = symbol.startsWith('6') ? `1.${symbol}` : `0.${symbol}`
    } else {
      secid = `116.${symbol}`
    }
    
    const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ut=7eea3edcaed734bea9cbfc24409ed989&ndays=${ndays}&iscr=0&secid=${secid}`
    
    const response = await axios.get(url)
    const data = response.data?.data
    
    if (!data) return { categoryData: [], values: [], volumes: [], preClose: 0 }
    
    const preClose = data.preClose
    const trends = data.trends || []
    
    const categoryData = []
    const values = []
    const volumes = []
    
    let prevPrice = preClose
    
    // 累计值用于计算分时均线
    let totalVolume = 0
    let totalAmount = 0
    
    // A股成交量单位是手(100股)，港股成交量单位是股
    const volumeMultiplier = market === 'a' ? 100 : 1
    
    trends.forEach((item, index) => {
      const fields = item.split(',')
      // 东方财富分时数据字段（8个）: 
      // fields[0]=时间, fields[1]=开盘, fields[2]=收盘(现价), 
      // fields[3]=最高, fields[4]=最低, fields[5]=成交量, 
      // fields[6]=成交额(元), fields[7]=均价
      const time = fields[0].split(' ')[1] || fields[0]
      const price = parseFloat(fields[2])         // 现价是收盘价
      const volume = parseFloat(fields[5]) || 0   // 当前分钟成交量
      const amount = parseFloat(fields[6]) || 0   // 当前分钟成交额(元)
      
      // 累加计算分时均线
      totalVolume += volume * volumeMultiplier
      totalAmount += amount
      
      // 分时均线 = 累计成交额 / 累计成交量(股)
      const avgPrice = totalVolume > 0 ? totalAmount / totalVolume : price
      
      categoryData.push(time)
      values.push([price, avgPrice])
      // 成交量颜色：当前价格>=前一个价格为红(涨)，否则为绿(跌)
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
 * @param {string} symbol - 股票代码
 * @param {string} market - 市场类型 'a' | 'hk'
 * @param {number} months - 获取月数，默认2个月
 * @param {string} period - K线周期: 'day'(日) | 'week'(周) | 'month'(月) | 'quarter'(季) | 'year'(年)
 */
export const fetchStockKline = async (symbol, market = 'hk', months = 2, period = 'day') => {
  try {
    // 根据周期类型调整最小时间范围，确保有足够的K线数据
    let actualMonths = months
    if (period === 'year') {
      actualMonths = Math.max(months, 240) // 至少20年
    } else if (period === 'quarter') {
      actualMonths = Math.max(months, 120) // 至少10年
    } else if (period === 'month') {
      actualMonths = Math.max(months, 60) // 至少5年
    } else if (period === 'week') {
      actualMonths = Math.max(months, 36) // 至少3年
    }
    
    const start = dayjs().subtract(actualMonths, 'month').format('YYYYMMDD')
    const end = dayjs().format('YYYYMMDD')
    
    // 根据市场类型构建 secid
    let secid
    if (market === 'a') {
      secid = symbol.startsWith('6') ? `1.${symbol}` : `0.${symbol}`
    } else {
      secid = `116.${symbol}`
    }
    
    // K线周期映射: 101=日, 102=周, 103=月, 104=季, 105=年
    const kltMap = { day: 101, week: 102, month: 103, quarter: 104, year: 105 }
    const klt = kltMap[period] || 101
    
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${klt}&fqt=1&beg=${start}&end=${end}`

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
    
    // 扩展字段获取更多数据
    // f43最新价 f44最高 f45最低 f46今开 f47成交量 f48成交额 f50振幅 f51涨停 f52跌停 
    // f55量比 f57代码 f58名称 f60昨收 f71均价 f100行业 f112板块
    // f116总市值 f117流通市值 f162市盈率 f163市盈率TTM f164市净率 f167市净率
    // f168换手率 f169涨跌额 f170涨跌幅 f173ROE f183总股本 f184流通股本 f185外盘 f186内盘
    // f187每股收益 f188每股净资产
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f51,f52,f55,f57,f58,f60,f71,f100,f116,f117,f162,f164,f167,f168,f169,f170,f173,f183,f184,f185,f186,f187,f188`
    const response = await axios.get(url)
    const data = response.data?.data
    
    if (!data) return null
    
    const priceDiv = market === 'a' ? 100 : 1000
    
    return {
      symbol: data.f57 || symbol,
      name: data.f58 || name,
      industry: data.f100 || '',           // 行业
      latestPrice: data.f43 / priceDiv,    // 最新价
      changePct: data.f170 / 100,          // 涨跌幅
      changeAmt: data.f169 / priceDiv,     // 涨跌额
      open: data.f46 / priceDiv,           // 今开
      high: data.f44 / priceDiv,           // 最高
      low: data.f45 / priceDiv,            // 最低
      preClose: data.f60 / priceDiv,       // 昨收
      limitUp: data.f51 / priceDiv,        // 涨停价
      limitDown: data.f52 / priceDiv,      // 跌停价
      avgPrice: data.f71 / priceDiv,       // 均价
      volume: data.f47,                    // 成交量（手）
      amount: data.f48,                    // 成交额
      outerVol: data.f185,                 // 外盘
      innerVol: data.f186,                 // 内盘
      totalMarketCap: data.f116,           // 总市值
      floatMarketCap: data.f117,           // 流通市值
      totalShares: data.f183,              // 总股本
      floatShares: data.f184,              // 流通股本
      peRatio: data.f162 / 100,            // 市盈率(动)
      pbRatio: data.f167 / 100,            // 市净率
      turnoverRate: data.f168 / 100,       // 换手率
      amplitude: data.f50 / 100,           // 振幅
      volumeRatio: data.f55 / 100,         // 量比
      eps: data.f187 / 100,                // 每股收益
      navps: data.f188 / 100,              // 每股净资产
      roe: data.f173 / 100,                // ROE
    }
  } catch (error) {
    console.error('获取股票信息失败:', error)
    return name ? { symbol, name } : null
  }
}

/**
 * 搜索股票（支持代码和名称模糊搜索）
 * @param {string} keyword - 搜索关键词
 * @param {number} limit - 返回数量限制
 */
export const searchStocks = async (keyword, limit = 20) => {
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
