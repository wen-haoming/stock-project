import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { NavBar, Card as MobileCard, Tabs as MobileTabs, Tag as MobileTag, SpinLoading, Empty as MobileEmpty, Selector, Grid as MobileGrid, List, Toast } from 'antd-mobile'
import { Card, Tabs, Tag, Empty, Spin, Button, Space, Tooltip } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import * as echarts from 'echarts'
import axios from 'axios'
import dayjs from 'dayjs'

// 颜色配置
const upColor = '#ec5a5a'
const downColor = '#47b262'

// 报告类型选项
const reportTypeOptions = [
  { label: '全部', value: '' },
  { label: '中报', value: '2' },
  { label: '年报', value: '4' },
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

// 获取个股 K 线数据 - 加载全量历史数据
const fetchStockKline = async (symbol, market = 'hk') => {
  try {
    // 从2023年开始加载全量数据
    const start = '20230101'
    const end = dayjs().format('YYYYMMDD')
    // 根据市场类型设置 secid
    let secid
    if (market === 'a') {
      // A股: 沪市(6开头) -> 1, 深市(0/3开头) -> 0
      const prefix = symbol.startsWith('6') ? '1' : '0'
      secid = `${prefix}.${symbol}`
    } else {
      // 港股
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

// 获取个股新闻
const fetchStockNews = async (name) => {
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

// 获取港股财务数据
const fetchFinanceData = async (symbol, reportType = '', market = 'hk') => {
  try {
    let reportName, filter
    if (market === 'a') {
      reportName = 'RPT_LICO_FN_CPD'
      filter = `(SECURITY_CODE="${symbol}")`
    } else {
      reportName = 'RPT_HKF10_FN_MAININDICATOR'
      filter = `(SECUCODE="${symbol}.HK")`
    }
    
    const params = new URLSearchParams({
      sortColumns: 'REPORT_DATE',
      sortTypes: '-1',
      pageSize: '50',
      pageNumber: '1',
      reportName,
      columns: 'ALL',
      source: 'SECURITIES',
      client: 'PC',
      filter,
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
      
      // A股和港股字段名不同
      if (market === 'a') {
        return {
          period: periodLabel,
          netProfit: item.PARENT_NETPROFIT ? item.PARENT_NETPROFIT / 100000000 : null,
          netProfitYoy: item.PARENT_NETPROFIT_YOY ?? null,
          revenue: item.TOTAL_OPERATE_INCOME ? item.TOTAL_OPERATE_INCOME / 100000000 : null,
          revenueYoy: item.TOTAL_OPERATE_INCOME_YOY ?? null,
          grossProfit: item.OPERATE_PROFIT ? item.OPERATE_PROFIT / 100000000 : null,
          eps: item.BASIC_EPS ?? null,
          navps: item.BPS ?? null,
          npm: item.NETPROFIT_MARGIN ?? null,
          gpm: item.GROSS_PROFIT_MARGIN ?? null,
          roe: item.ROE ?? null,
          dar: item.DEBT_ASSET_RATIO ?? null,
        }
      }
      
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

// 获取股票基本信息
const fetchStockInfo = async (symbol, name = '', market = 'hk') => {
  try {
    // 根据市场类型设置 secid
    let secid
    if (market === 'a') {
      // A股: 沪市(6开头) -> 1, 深市(0/3开头) -> 0
      const prefix = symbol.startsWith('6') ? '1' : '0'
      secid = `${prefix}.${symbol}`
    } else {
      // 港股
      secid = `116.${symbol}`
    }
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f51,f52,f55,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170`
    const response = await axios.get(url)
    const data = response.data?.data
    
    if (!data) return null
    
    // A股价格单位是分，港股是厘
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

// K线图组件 - 使用 ECharts 支持 brush
const KlineChart = memo(({ data, stockName, dateRange, height = 280 }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  // 计算 brush 区间的索引
  const brushRange = useMemo(() => {
    if (!data?.categoryData?.length || !dateRange?.start || !dateRange?.end) {
      return null
    }
    
    const startIdx = data.categoryData.findIndex(d => d >= dateRange.start)
    const endIdx = data.categoryData.findIndex(d => d > dateRange.end)
    
    const start = startIdx >= 0 ? (startIdx / data.categoryData.length) * 100 : 80
    const end = endIdx >= 0 ? (endIdx / data.categoryData.length) * 100 : 100
    
    return { start: Math.max(0, start), end: Math.min(100, end) }
  }, [data, dateRange])

  useEffect(() => {
    if (!chartRef.current || !data?.values?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    // 计算选中区间的涨跌幅
    let rangeInfo = ''
    if (brushRange && data.values.length > 0) {
      const startIdx = Math.floor((brushRange.start / 100) * data.categoryData.length)
      const endIdx = Math.min(Math.floor((brushRange.end / 100) * data.categoryData.length), data.categoryData.length - 1)
      if (startIdx >= 0 && endIdx >= startIdx && data.values[startIdx] && data.values[endIdx]) {
        const startPrice = data.values[startIdx][0] // 开盘价
        const endPrice = data.values[endIdx][1] // 收盘价
        const changePct = ((endPrice - startPrice) / startPrice * 100).toFixed(2)
        rangeInfo = `区间涨幅: ${changePct >= 0 ? '+' : ''}${changePct}%`
      }
    }

    chart.setOption({
      animation: false,
      title: rangeInfo ? {
        text: rangeInfo,
        left: 'center',
        top: 5,
        textStyle: { fontSize: 12, fontWeight: 'normal', color: '#666' }
      } : undefined,
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'cross' },
        formatter: (params) => {
          if (!params || !params.length) return ''
          const date = params[0].axisValue
          const kline = params.find(p => p.seriesName === stockName)
          if (!kline || !kline.data) return date
          const [open, close, low, high] = kline.data
          const change = ((close - open) / open * 100).toFixed(2)
          return `
            <div style="font-size:12px">
              <div style="font-weight:bold;margin-bottom:4px">${date}</div>
              <div>开: ${open.toFixed(2)}</div>
              <div>收: ${close.toFixed(2)}</div>
              <div>高: ${high.toFixed(2)}</div>
              <div>低: ${low.toFixed(2)}</div>
              <div style="color:${change >= 0 ? upColor : downColor}">涨跌: ${change >= 0 ? '+' : ''}${change}%</div>
            </div>
          `
        }
      },
      grid: [
        { left: 45, right: 10, top: 30, bottom: '28%' },
        { left: 45, right: 10, top: '75%', bottom: 45 }
      ],
      xAxis: [
        { type: 'category', data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, splitLine: { show: false }, axisLabel: { fontSize: 10 } },
        { type: 'category', gridIndex: 1, data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, axisLabel: { show: false } }
      ],
      yAxis: [
        { scale: true, splitArea: { show: true }, axisLabel: { fontSize: 10 } },
        { scale: true, gridIndex: 1, axisLabel: { show: false }, axisLine: { show: false }, splitLine: { show: false } }
      ],
      dataZoom: [
        { 
          type: 'slider', 
          xAxisIndex: [0, 1], 
          start: brushRange?.start ?? 80, 
          end: brushRange?.end ?? 100,
          height: 20,
          bottom: 10,
          borderColor: 'transparent',
          backgroundColor: '#f5f5f5',
          fillerColor: 'rgba(24, 144, 255, 0.2)',
          handleStyle: { color: '#1890ff' },
          textStyle: { fontSize: 10 }
        }
      ],
      visualMap: {
        show: false,
        seriesIndex: 1,
        dimension: 2,
        pieces: [{ value: 1, color: downColor }, { value: -1, color: upColor }]
      },
      series: [
        {
          name: stockName,
          type: 'candlestick',
          data: data.values,
          itemStyle: { color: upColor, color0: downColor, borderColor: 'transparent', borderColor0: 'transparent', borderWidth: 0 }
        },
        { name: 'Volume', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: data.volumes }
      ]
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, stockName, brushRange])

  return <div ref={chartRef} style={{ height }} />
})

// 财务图表组件
const FinanceChart = memo(({ data, metric, height = 220 }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !data?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    const metricConfig = financeMetrics.find(m => m.key === metric)
    const chartData = data.slice(-12)
    const categories = chartData.map(d => d.period)
    const values = chartData.map(d => d[metric] ?? 0)

    chart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 50, right: 15, top: 20, bottom: 50 },
      xAxis: { type: 'category', data: categories, axisLabel: { fontSize: 9, rotate: 45 } },
      yAxis: { type: 'value', name: metricConfig?.unit, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
      series: [{
        type: 'bar',
        data: values,
        itemStyle: { color: (params) => values[params.dataIndex] >= 0 ? '#1890ff' : downColor }
      }]
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, metric])

  return <div ref={chartRef} style={{ height }} />
})

// 基础信息组件 - 移动端
const BasicInfoMobile = memo(({ stock }) => {
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
    <MobileGrid columns={3} gap={8} style={{ padding: '12px 0' }}>
      {items.map((item, idx) => (
        <MobileGrid.Item key={idx} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{item.label}</div>
          <div style={{ fontSize: 14, fontWeight: 'bold', color: item.color || '#333' }}>{item.value}</div>
        </MobileGrid.Item>
      ))}
    </MobileGrid>
  )
})

// 基础信息组件 - 桌面端
const BasicInfoDesktop = memo(({ stock }) => {
  if (!stock) return null
  
  const items = [
    { label: '最新价', value: stock.latestPrice?.toFixed(2) || '-', color: (stock.changePct || 0) >= 0 ? upColor : downColor },
    { label: '涨幅', value: stock.changePct ? `${stock.changePct >= 0 ? '+' : ''}${stock.changePct?.toFixed(2)}%` : '-', color: (stock.changePct || 0) >= 0 ? upColor : downColor },
    { label: '市值', value: stock.totalMarketCap ? `${(stock.totalMarketCap / 100000000).toFixed(0)}亿` : '-' },
    { label: '市盈率', value: stock.peRatio?.toFixed(2) || '-' },
    { label: '市净率', value: stock.pbRatio?.toFixed(2) || '-' },
    { label: '换手率', value: stock.turnoverRate ? `${stock.turnoverRate.toFixed(2)}%` : '-' },
    { label: '振幅', value: stock.amplitude ? `${stock.amplitude.toFixed(2)}%` : '-' },
    { label: '量比', value: stock.volumeRatio?.toFixed(2) || '-' },
  ]

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, padding: '16px 0' }}>
      {items.map((item, idx) => (
        <div key={idx} style={{ minWidth: 80 }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>{item.label}</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: item.color || '#333' }}>{item.value}</div>
        </div>
      ))}
    </div>
  )
})

// 财务数据组件 - 移动端
const FinanceSectionMobile = memo(({ data, reportType, onReportTypeChange }) => {
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
          <MobileTag
            key={m.key}
            color={metric === m.key ? 'primary' : 'default'}
            fill={metric === m.key ? 'solid' : 'outline'}
            onClick={() => setMetric(m.key)}
            style={{ fontSize: 12, padding: '4px 8px' }}
          >
            {m.label}
          </MobileTag>
        ))}
      </div>

      {data?.length > 0 ? (
        <FinanceChart data={data} metric={metric} />
      ) : (
        <MobileEmpty description="暂无财务数据" style={{ padding: 40 }} />
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

// 财务数据组件 - 桌面端
const FinanceSectionDesktop = memo(({ data, reportType, onReportTypeChange }) => {
  const [metric, setMetric] = useState('netProfit')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <span style={{ color: '#666' }}>报告类型:</span>
        <Space>
          {reportTypeOptions.map(opt => (
            <Tag
              key={opt.value}
              color={reportType === opt.value ? 'blue' : 'default'}
              style={{ cursor: 'pointer' }}
              onClick={() => onReportTypeChange(opt.value)}
            >
              {opt.label}
            </Tag>
          ))}
        </Space>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ color: '#666' }}>指标:</span>
        {financeMetrics.map(m => (
          <Tag
            key={m.key}
            color={metric === m.key ? 'blue' : 'default'}
            style={{ cursor: 'pointer' }}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </Tag>
        ))}
      </div>

      {data?.length > 0 ? (
        <FinanceChart data={data} metric={metric} height={300} />
      ) : (
        <Empty description="暂无财务数据" style={{ padding: 60 }} />
      )}

      {data?.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 12 }}>近期数据</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {data.slice(-6).reverse().map((item, idx) => (
              <div key={idx} style={{ padding: 12, background: '#fafafa', borderRadius: 8 }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>{item.period}</div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: item.netProfit >= 0 ? '#1890ff' : downColor }}>
                  {item.netProfit?.toFixed(2)}亿
                </div>
                {item.netProfitYoy !== null && (
                  <div style={{ fontSize: 12, marginTop: 4, color: item.netProfitYoy >= 0 ? upColor : downColor }}>
                    同比: {item.netProfitYoy >= 0 ? '+' : ''}{item.netProfitYoy?.toFixed(1)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

// 新闻列表组件 - 移动端
const NewsSectionMobile = memo(({ news }) => (
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
      <MobileEmpty description="暂无相关资讯" style={{ padding: 40 }} />
    )}
  </List>
))

// 新闻列表组件 - 桌面端
const NewsSectionDesktop = memo(({ news }) => (
  <div>
    {news.length > 0 ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {news.map((item, idx) => (
          <div 
            key={idx} 
            onClick={() => window.open(item.url, '_blank')}
            style={{ 
              padding: 16, 
              background: '#fafafa', 
              borderRadius: 8, 
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fafafa'}
          >
            <div style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 8 }}>{item.title}</div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#999' }}>
              <span>{item.source}</span>
              <span>{item.date}</span>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <Empty description="暂无相关资讯" style={{ padding: 60 }} />
    )}
  </div>
))

// 生成东财链接
const getEastMoneyUrl = (symbol, market = 'hk') => {
  if (market === 'a') {
    const prefix = symbol.startsWith('6') ? 'sh' : 'sz'
    return `https://quote.eastmoney.com/${prefix}${symbol}.html`
  }
  return `https://quote.eastmoney.com/hk/${symbol}.html`
}

// 生成雪球链接
const getXueqiuUrl = (symbol, market = 'hk') => {
  if (market === 'a') {
    const prefix = symbol.startsWith('6') ? 'SH' : 'SZ'
    return `https://xueqiu.com/S/${prefix}${symbol}`
  }
  return `https://xueqiu.com/S/${symbol}`
}

// 判断是否为移动端
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  return isMobile
}

// 主组件 - 路由页面
export default function DetailMobilePage() {
  const { symbol } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  
  const [loading, setLoading] = useState(true)
  const [stock, setStock] = useState(null)
  const [klineData, setKlineData] = useState(null)
  const [financeData, setFinanceData] = useState([])
  const [stockNews, setStockNews] = useState([])
  const [reportType, setReportType] = useState('')
  const [activeTab, setActiveTab] = useState('kline')

  // 从 URL 参数获取股票名称、日期区间和市场
  const stockName = searchParams.get('name') || ''
  const market = searchParams.get('market') || 'hk'
  const dateRange = useMemo(() => ({
    start: searchParams.get('start') || '',
    end: searchParams.get('end') || ''
  }), [searchParams])

  // 加载财务数据
  const loadFinanceData = useCallback(async (sym, type) => {
    const finance = await fetchFinanceData(sym, type, market)
    setFinanceData(finance)
  }, [market])

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
        const [stockInfo, kline, finance] = await Promise.all([
          fetchStockInfo(symbol, stockName, market),
          fetchStockKline(symbol, market),
          fetchFinanceData(symbol, '', market),
        ])
        
        setStock(stockInfo)
        setKlineData(kline)
        setFinanceData(finance)
        
        const newsName = stockInfo?.name || stockName
        if (newsName) {
          const news = await fetchStockNews(newsName)
          setStockNews(news)
        }
      } catch (error) {
        console.error('加载数据失败:', error)
        if (isMobile) {
          Toast.show({ content: '加载数据失败', icon: 'fail' })
        }
      } finally {
        setLoading(false)
      }
    }

    loadData()
    setReportType('')
  }, [symbol, stockName, market, isMobile])

  if (loading) {
    if (isMobile) {
      return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
          <SpinLoading color="primary" />
        </div>
      )
    }
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!stock) {
    if (isMobile) {
      return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
          <NavBar onBack={handleBack} style={{ background: '#fff', borderBottom: '1px solid #eee' }}>
            股票详情
          </NavBar>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MobileEmpty description={`未找到股票 ${symbol}`} />
          </div>
        </div>
      )
    }
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
        <div style={{ padding: 16, background: '#fff', borderBottom: '1px solid #eee' }}>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>返回</Button>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description={`未找到股票 ${symbol}`} />
        </div>
      </div>
    )
  }

  // 桌面端布局
  if (!isMobile) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        {/* 顶部导航 */}
        <div style={{ padding: '12px 24px', background: '#fff', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>返回</Button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20, fontWeight: 'bold' }}>{stock.name}</span>
              <span style={{ fontSize: 14, color: '#999' }}>{stock.symbol}</span>
              <span style={{ fontSize: 24, fontWeight: 'bold', color: (stock.changePct || 0) >= 0 ? upColor : downColor }}>
                {stock.latestPrice?.toFixed(2) || '-'}
              </span>
              {stock.changePct !== undefined && (
                <Tag color={(stock.changePct || 0) >= 0 ? 'red' : 'green'}>
                  {stock.changePct >= 0 ? '+' : ''}{stock.changePct?.toFixed(2)}%
                </Tag>
              )}
            </div>
          </div>
          <Space>
            <Tooltip title="在东方财富查看">
              <Button size="small" onClick={() => window.open(getEastMoneyUrl(stock.symbol, market), '_blank')}>东财</Button>
            </Tooltip>
            <Tooltip title="在雪球查看">
              <Button size="small" onClick={() => window.open(getXueqiuUrl(stock.symbol, market), '_blank')}>雪球</Button>
            </Tooltip>
          </Space>
        </div>

        {/* 基本信息 */}
        <div style={{ padding: '0 24px' }}>
          <Card style={{ marginTop: 16 }}>
            <BasicInfoDesktop stock={stock} />
          </Card>
        </div>

        {/* 内容区域 */}
        <div style={{ padding: '16px 24px' }}>
          <Card>
            <Tabs activeKey={activeTab} onChange={setActiveTab}>
              <Tabs.TabPane tab="K线走势" key="kline">
                <div style={{ padding: '16px 0' }}>
                  {dateRange.start && dateRange.end && (
                    <div style={{ fontSize: 13, color: '#999', marginBottom: 12 }}>
                      查询区间: {dateRange.start} ~ {dateRange.end}
                    </div>
                  )}
                  {klineData?.values?.length > 0 ? (
                    <KlineChart data={klineData} stockName={stock.name} dateRange={dateRange} height={400} />
                  ) : (
                    <Empty description="暂无K线数据" style={{ padding: 60 }} />
                  )}
                </div>
              </Tabs.TabPane>

              <Tabs.TabPane tab="财务数据" key="finance">
                <div style={{ padding: '16px 0' }}>
                  <FinanceSectionDesktop
                    data={financeData}
                    reportType={reportType}
                    onReportTypeChange={handleReportTypeChange}
                  />
                </div>
              </Tabs.TabPane>

              <Tabs.TabPane tab="相关资讯" key="news">
                <div style={{ padding: '16px 0' }}>
                  <NewsSectionDesktop news={stockNews} />
                </div>
              </Tabs.TabPane>
            </Tabs>
          </Card>
        </div>
      </div>
    )
  }

  // 移动端布局
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
      <MobileCard style={{ margin: 0, borderRadius: 0 }}>
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
        <BasicInfoMobile stock={stock} />
      </MobileCard>

      {/* 内容区域 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MobileTabs activeKey={activeTab} onChange={setActiveTab} style={{ '--title-font-size': '14px' }}>
          <MobileTabs.Tab title="走势" key="kline">
            <MobileCard style={{ margin: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
                K线走势
                {dateRange.start && dateRange.end && (
                  <span style={{ fontSize: 11, color: '#999', fontWeight: 'normal', marginLeft: 8 }}>
                    (首页区间: {dateRange.start} ~ {dateRange.end})
                  </span>
                )}
              </div>
              {klineData?.values?.length > 0 ? (
                <KlineChart data={klineData} stockName={stock.name} dateRange={dateRange} />
              ) : (
                <MobileEmpty description="暂无K线数据" style={{ padding: 40 }} />
              )}
            </MobileCard>
          </MobileTabs.Tab>

          <MobileTabs.Tab title="财务" key="finance">
            <MobileCard style={{ margin: 12, borderRadius: 8 }}>
              <FinanceSectionMobile
                data={financeData}
                reportType={reportType}
                onReportTypeChange={handleReportTypeChange}
              />
            </MobileCard>
          </MobileTabs.Tab>

          <MobileTabs.Tab title="资讯" key="news">
            <MobileCard style={{ margin: 12, borderRadius: 8, padding: 0 }}>
              <NewsSectionMobile news={stockNews} />
            </MobileCard>
          </MobileTabs.Tab>
        </MobileTabs>
      </div>
    </div>
  )
}
