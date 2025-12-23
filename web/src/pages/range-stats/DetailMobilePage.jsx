import { useState, useEffect, useCallback, memo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { NavBar, Card, Tabs, Tag, SpinLoading, Empty, Selector, Grid, List, Toast } from 'antd-mobile'
import Canvas from '@antv/f2-react'
import { Chart, Line, Axis, Tooltip, Interval } from '@antv/f2'
import axios from 'axios'
import dayjs from 'dayjs'

// 颜色配置
const upColor = '#ec5a5a'
const downColor = '#47b262'

// 报告类型选项（港股通常只披露中报和年报）
const reportTypeOptions = [
  { label: '全部', value: '' },
  { label: '年报', value: '4' },
  { label: '中报', value: '2' },
]

// 财务指标配置
const financeMetrics = [
  { key: 'netProfit', label: '净利润', unit: '亿' },
  { key: 'revenue', label: '营收', unit: '亿' },
  { key: 'grossProfit', label: '毛利', unit: '亿' },
  { key: 'npm', label: '净利率', unit: '%' },
  { key: 'gpm', label: '毛利率', unit: '%' },
  { key: 'roe', label: 'ROE', unit: '%' },
]

// 获取个股 K 线数据
const fetchStockKline = async (symbol) => {
  try {
    const start = dayjs().subtract(6, 'month').format('YYYYMMDD')
    const end = dayjs().format('YYYYMMDD')
    const secid = `116.${symbol}`
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${start}&end=${end}`

    const response = await axios.get(url)
    const rawData = response.data?.data?.klines || []

    return rawData.map((item) => {
      const fields = item.split(',')
      const close = parseFloat(fields[2])
      const open = parseFloat(fields[1])
      return {
        date: fields[0].slice(5),
        close,
        open,
        high: parseFloat(fields[3]),
        low: parseFloat(fields[4]),
        volume: parseInt(fields[5]),
        change: close - open,
      }
    })
  } catch (error) {
    console.error('获取个股K线失败:', error)
    return []
  }
}

// 获取个股新闻
const fetchStockNews = async (name) => {
  try {
    const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=jQuery&param={"uid":"","keyword":"${encodeURIComponent(name)}","type":["cmsArticleWebOld"],"client":"web","clientType":"web","clientVersion":"curr","param":{"cmsArticleWebOld":{"searchScope":"default","sort":"default","pageIndex":1,"pageSize":10,"preTag":"<em>","postTag":"</em>"}}}`
    const response = await axios.get(url)
    const jsonStr = response.data.replace(/^jQuery\(/, '').replace(/\)$/, '')
    const data = JSON.parse(jsonStr)
    return (data?.result?.cmsArticleWebOld?.list || []).map(item => ({
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

// 获取港股财务数据
const fetchFinanceData = async (symbol, reportType = '') => {
  try {
    const params = new URLSearchParams({
      sortColumns: 'REPORT_DATE',
      sortTypes: '-1',
      pageSize: '50',
      pageNumber: '1',
      reportName: 'RPT_HKF10_FN_MAININDICATOR',
      columns: 'ALL',
      source: 'SECURITIES',
      client: 'PC',
      filter: `(SECUCODE="${symbol}.HK")`,
    })
    
    const url = `https://datacenter.eastmoney.com/securities/api/data/v1/get?${params.toString()}`
    const response = await axios.get(url)
    
    let result = response.data?.result?.data || []
    
    if (!result.length) return []
    
    if (reportType) {
      const monthMap = { '1': 3, '2': 6, '3': 9, '4': 12 }
      const targetMonth = monthMap[reportType]
      if (targetMonth) {
        result = result.filter(item => {
          const month = dayjs(item.REPORT_DATE).month() + 1
          return month === targetMonth
        })
      }
    }
    
    return result.map(item => {
      const date = dayjs(item.REPORT_DATE)
      const month = date.month() + 1
      const year = date.year()
      
      let periodLabel = ''
      if (month === 3) periodLabel = `${year}Q1`
      else if (month === 6) periodLabel = `${year}H1`
      else if (month === 9) periodLabel = `${year}Q3`
      else if (month === 12) periodLabel = `${year}Y`
      else periodLabel = date.format('YYYY-MM')
      
      return {
        period: periodLabel,
        netProfit: item.HOLDER_PROFIT ? item.HOLDER_PROFIT / 100000000 : null,
        netProfitYoy: item.HOLDER_PROFIT_YOY ?? null,
        revenue: item.OPERATE_INCOME ? item.OPERATE_INCOME / 100000000 : null,
        revenueYoy: item.OPERATE_INCOME_YOY ?? null,
        grossProfit: item.GROSS_PROFIT ? item.GROSS_PROFIT / 100000000 : null,
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

// 获取股票基本信息（从东方财富实时行情）
const fetchStockInfo = async (symbol, name = '') => {
  try {
    const secid = `116.${symbol}`
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f51,f52,f55,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170`
    const response = await axios.get(url)
    const data = response.data?.data
    
    if (!data) return null
    
    return {
      symbol: data.f57 || symbol,
      name: data.f58 || name,
      latestPrice: data.f43 / 1000, // 最新价（需要除以1000）
      changePct: data.f170 / 100, // 涨跌幅
      changeAmt: data.f169 / 1000, // 涨跌额
      open: data.f46 / 1000, // 开盘价
      high: data.f44 / 1000, // 最高价
      low: data.f45 / 1000, // 最低价
      preClose: data.f60 / 1000, // 昨收
      volume: data.f47, // 成交量
      amount: data.f48, // 成交额
      totalMarketCap: data.f116, // 总市值
      floatMarketCap: data.f117, // 流通市值
      peRatio: data.f162 / 100, // 市盈率
      pbRatio: data.f167 / 100, // 市净率
      turnoverRate: data.f168 / 100, // 换手率
      amplitude: data.f50 / 100, // 振幅
      volumeRatio: data.f55 / 100, // 量比
    }
  } catch (error) {
    console.error('获取股票信息失败:', error)
    // 如果获取失败，返回基础信息
    return name ? { symbol, name } : null
  }
}

// K线图组件
const KlineChart = memo(({ data }) => {
  if (!data?.length) return null

  return (
    <Canvas pixelRatio={window.devicePixelRatio}>
      <Chart data={data}>
        <Axis field="date" tickCount={5} style={{ label: { fontSize: 10 } }} />
        <Axis field="close" tickCount={5} style={{ label: { fontSize: 10 } }} />
        <Line x="date" y="close" color={upColor} />
        <Tooltip />
      </Chart>
    </Canvas>
  )
})

// 财务图表组件
const FinanceChart = memo(({ data, metric }) => {
  if (!data?.length) return null

  const chartData = data.slice(-12).map(d => ({
    period: d.period,
    value: d[metric] ?? 0,
  }))

  return (
    <Canvas pixelRatio={window.devicePixelRatio}>
      <Chart data={chartData}>
        <Axis field="period" tickCount={6} style={{ label: { fontSize: 9 } }} />
        <Axis field="value" tickCount={5} style={{ label: { fontSize: 10 } }} />
        <Interval
          x="period"
          y="value"
          color={{
            field: 'value',
            callback: (val) => val >= 0 ? '#1890ff' : downColor
          }}
        />
        <Tooltip />
      </Chart>
    </Canvas>
  )
})

// 基础信息组件
const BasicInfo = memo(({ stock }) => {
  if (!stock) return null
  
  const items = [
    { label: '最新价', value: stock.latestPrice?.toFixed(2) || '-', color: (stock.changePct || 0) >= 0 ? upColor : downColor },
    { label: '涨幅', value: stock.changePct ? `${stock.changePct >= 0 ? '+' : ''}${stock.changePct?.toFixed(2)}%` : '-', color: (stock.changePct || 0) >= 0 ? upColor : downColor },
    { label: '市值', value: stock.totalMarketCap ? `${(stock.totalMarketCap / 100000000).toFixed(0)}亿` : '-' },
    { label: '市盈率', value: stock.peRatio?.toFixed(2) || '-' },
    { label: '市净率', value: stock.pbRatio?.toFixed(2) || '-' },
    { label: '换手率', value: stock.turnoverRate ? `${stock.turnoverRate.toFixed(2)}%` : '-' },
  ]

  return (
    <Grid columns={3} gap={8} style={{ padding: '12px 0' }}>
      {items.map((item, idx) => (
        <Grid.Item key={idx} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{item.label}</div>
          <div style={{ fontSize: 14, fontWeight: 'bold', color: item.color || '#333' }}>{item.value}</div>
        </Grid.Item>
      ))}
    </Grid>
  )
})

// 财务数据组件
const FinanceSection = memo(({ data, reportType, onReportTypeChange }) => {
  const [metric, setMetric] = useState('netProfit')

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Selector
          options={reportTypeOptions}
          value={[reportType]}
          onChange={(v) => onReportTypeChange(v[0] || '')}
          style={{ '--border-radius': '8px', '--checked-color': '#1677ff', '--checked-text-color': '#fff' }}
        />
      </div>
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {financeMetrics.map(m => (
          <Tag
            key={m.key}
            color={metric === m.key ? 'primary' : 'default'}
            fill={metric === m.key ? 'solid' : 'outline'}
            onClick={() => setMetric(m.key)}
            style={{ fontSize: 12, padding: '4px 8px' }}
          >
            {m.label}
          </Tag>
        ))}
      </div>

      {data?.length > 0 ? (
        <div style={{ height: 220 }}>
          <FinanceChart data={data} metric={metric} />
        </div>
      ) : (
        <Empty description="暂无财务数据" style={{ padding: 40 }} />
      )}

      {data?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8 }}>近期数据</div>
          {data.slice(-5).reverse().map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: 12, color: '#666' }}>{item.period}</span>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: item.netProfit >= 0 ? '#1890ff' : downColor }}>
                  {item.netProfit?.toFixed(2)}亿
                </span>
                {item.netProfitYoy !== null && (
                  <span style={{ fontSize: 11, marginLeft: 8, color: item.netProfitYoy >= 0 ? upColor : downColor }}>
                    {item.netProfitYoy >= 0 ? '+' : ''}{item.netProfitYoy?.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

// 新闻列表组件
const NewsSection = memo(({ news }) => (
  <List>
    {news.length > 0 ? (
      news.map((item, idx) => (
        <List.Item
          key={idx}
          onClick={() => window.open(item.url, '_blank')}
          description={
            <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#999', marginTop: 4 }}>
              <span>{item.source}</span>
              <span>{item.date}</span>
            </div>
          }
        >
          <div style={{ fontSize: 14, lineHeight: 1.4 }}>{item.title}</div>
        </List.Item>
      ))
    ) : (
      <Empty description="暂无相关资讯" style={{ padding: 40 }} />
    )}
  </List>
))

// 主组件 - 路由页面
export default function DetailMobilePage() {
  const { symbol } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const [loading, setLoading] = useState(true)
  const [stock, setStock] = useState(null)
  const [klineData, setKlineData] = useState([])
  const [financeData, setFinanceData] = useState([])
  const [stockNews, setStockNews] = useState([])
  const [reportType, setReportType] = useState('')
  const [activeTab, setActiveTab] = useState('kline')

  // 从 URL 参数获取股票名称（用于新闻搜索）
  const stockName = searchParams.get('name') || ''

  // 加载财务数据
  const loadFinanceData = useCallback(async (sym, type) => {
    const finance = await fetchFinanceData(sym, type)
    setFinanceData(finance)
  }, [])

  // 报告类型变化
  const handleReportTypeChange = useCallback((value) => {
    setReportType(value)
    if (symbol) {
      loadFinanceData(symbol, value)
    }
  }, [symbol, loadFinanceData])

  // 返回上一页
  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/range-stats')
    }
  }, [navigate])

  // 加载数据
  useEffect(() => {
    if (!symbol) return

    const loadData = async () => {
      setLoading(true)
      try {
        // 并行加载所有数据
        const [stockInfo, kline, finance] = await Promise.all([
          fetchStockInfo(symbol, stockName),
          fetchStockKline(symbol),
          fetchFinanceData(symbol, ''),
        ])
        
        setStock(stockInfo)
        setKlineData(kline)
        setFinanceData(finance)
        
        // 新闻使用股票名称搜索
        const newsName = stockInfo?.name || stockName
        if (newsName) {
          const news = await fetchStockNews(newsName)
          setStockNews(news)
        }
      } catch (error) {
        console.error('加载数据失败:', error)
        Toast.show({ content: '加载数据失败', icon: 'fail' })
      } finally {
        setLoading(false)
      }
    }

    loadData()
    setReportType('')
  }, [symbol, stockName])

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <SpinLoading color="primary" />
      </div>
    )
  }

  if (!stock) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
        <NavBar onBack={handleBack} style={{ background: '#fff', borderBottom: '1px solid #eee' }}>
          股票详情
        </NavBar>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description={`未找到股票 ${symbol}`} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
      {/* 顶部导航 */}
      <NavBar onBack={handleBack} style={{ background: '#fff', borderBottom: '1px solid #eee' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 'bold' }}>{stock.name}</span>
          <span style={{ fontSize: 12, color: '#999' }}>{stock.symbol}</span>
        </div>
      </NavBar>

      {/* 价格信息 */}
      <Card style={{ margin: 0, borderRadius: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 28, fontWeight: 'bold', color: (stock.changePct || 0) >= 0 ? upColor : downColor }}>
            {stock.latestPrice?.toFixed(2) || '-'}
          </span>
          {stock.changePct !== undefined && (
            <span style={{ fontSize: 16, color: stock.changePct >= 0 ? upColor : downColor }}>
              {stock.changePct >= 0 ? '+' : ''}{stock.changePct?.toFixed(2)}%
            </span>
          )}
        </div>
        <BasicInfo stock={stock} />
      </Card>

      {/* 内容区域 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ '--title-font-size': '14px' }}>
          <Tabs.Tab title="走势" key="kline">
            <Card style={{ margin: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 12 }}>近6个月走势</div>
              {klineData.length > 0 ? (
                <div style={{ height: 200 }}>
                  <KlineChart data={klineData} />
                </div>
              ) : (
                <Empty description="暂无K线数据" style={{ padding: 40 }} />
              )}
            </Card>
          </Tabs.Tab>

          <Tabs.Tab title="财务" key="finance">
            <Card style={{ margin: 12, borderRadius: 8 }}>
              <FinanceSection
                data={financeData}
                reportType={reportType}
                onReportTypeChange={handleReportTypeChange}
              />
            </Card>
          </Tabs.Tab>

          <Tabs.Tab title="资讯" key="news">
            <Card style={{ margin: 12, borderRadius: 8, padding: 0 }}>
              <NewsSection news={stockNews} />
            </Card>
          </Tabs.Tab>
        </Tabs>
      </div>
    </div>
  )
}
