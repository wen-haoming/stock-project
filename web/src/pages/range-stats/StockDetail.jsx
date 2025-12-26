import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { Card, Table, Spin, Empty, Radio, Statistic, Row, Col, Grid, Select, Space, Button, message, Tooltip } from 'antd'
import { DownloadOutlined, CopyOutlined, CameraOutlined, QuestionCircleOutlined, FileTextOutlined } from '@ant-design/icons'
import * as echarts from 'echarts'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import axios from 'axios'
import dayjs from 'dayjs'

const { useBreakpoint } = Grid

// ECharts 颜色配置
const upColor = '#ec5a5a'
const downColor = '#47b262'

// 报告类型选项
const reportTypeOptions = [
  { label: '全部', value: '' },
  { label: '中报', value: '2' },
  { label: '年报', value: '4' },
]

// 财务指标配置（含解释、公式、例子）
const financeMetrics = [
  { key: 'netProfit', label: '归母净利润', unit: '亿', yoyKey: 'netProfitYoy', tip: '解释：扣除所有成本费用后，真正属于股东的利润\n公式：营业收入 - 成本 - 费用 - 税金\n例子：收入100亿，各项支出80亿，归母净利润=20亿' },
  { key: 'revenue', label: '营业收入', unit: '亿', yoyKey: 'revenueYoy', tip: '解释：公司主营业务获得的全部收入，反映经营规模\n公式：销售数量 × 单价\n例子：卖出1000万部手机，每部3000元，营业收入=300亿' },
  { key: 'grossProfit', label: '毛利润', unit: '亿', yoyKey: 'grossProfitYoy', tip: '解释：扣除直接生产成本后的利润，体现产品盈利能力\n公式：营业收入 - 营业成本\n例子：收入100亿，生产成本60亿，毛利润=40亿' },
  { key: 'eps', label: '每股收益', unit: '元', yoyKey: null, tip: '解释：每一股能赚多少钱，衡量股票价值的核心指标\n公式：净利润 ÷ 总股本\n例子：净利润10亿，股本5亿股，EPS=2元/股' },
  { key: 'navps', label: '每股净资产', unit: '元', yoyKey: null, tip: '解释：每一股对应的账面价值，可判断股价是否被低估\n公式：净资产 ÷ 总股本\n例子：净资产50亿，股本5亿股，每股净资产=10元' },
  { key: 'npm', label: '净利率', unit: '%', yoyKey: null, tip: '解释：每100元收入能赚多少净利润，反映综合盈利能力\n公式：净利润 ÷ 营业收入 × 100%\n例子：收入100亿，净利润20亿，净利率=20%' },
  { key: 'gpm', label: '毛利率', unit: '%', yoyKey: null, tip: '解释：每100元收入扣除成本后剩多少，反映产品定价权\n公式：毛利润 ÷ 营业收入 × 100%\n例子：收入100亿，毛利润40亿，毛利率=40%' },
  { key: 'roe', label: 'ROE', unit: '%', yoyKey: null, tip: '解释：股东投入的钱能产生多少回报，巴菲特最看重的指标\n公式：净利润 ÷ 净资产 × 100%\n例子：净资产100亿，净利润15亿，ROE=15%' },
  { key: 'dar', label: '资产负债率', unit: '%', yoyKey: null, tip: '解释：公司负债占总资产的比例，衡量财务风险\n公式：总负债 ÷ 总资产 × 100%\n例子：总资产100亿，负债50亿，资产负债率=50%' },
]

// 获取个股 K 线数据（全量数据，3年）
const fetchStockKline = async (symbol, market = 'hk') => {
  try {
    const start = dayjs().subtract(3, 'year').format('YYYYMMDD')
    const end = dayjs().format('YYYYMMDD')
    
    // 根据市场类型构建 secid
    let secid
    if (market === 'a') {
      // A股: 沪市(6开头)=1.代码, 深市(0/3开头)=0.代码
      secid = symbol.startsWith('6') ? `1.${symbol}` : `0.${symbol}`
    } else {
      // 港股: 116.代码
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

// 公告分类选项
const announcementCategories = [
  { label: '全部', value: '0' },
  { label: '业绩报告', value: '1' },
  { label: '融资公告', value: '2' },
  { label: '风险提示', value: '3' },
  { label: '资产重组', value: '4' },
  { label: '信息变更', value: '5' },
]

// 获取A股公告列表
const fetchAnnouncements = async (symbol, page = 1, pageSize = 10, category = '0') => {
  try {
    const response = await axios.get('/api/v1/stock/announcements', {
      params: { symbol, page, page_size: pageSize, category }
    })
    const data = response.data?.data || {}
    return {
      list: (data.list || []).map(item => {
        // 从 eiTime 解析时间戳，格式: "2025-12-22 21:05:29:000"
        let timestamp = Date.now()
        if (item.eiTime) {
          const eiTime = item.eiTime.replace(/:(\d{3})$/, '.$1')
          const date = new Date(eiTime)
          if (!isNaN(date.getTime())) {
            timestamp = date.getTime()
          }
        }
        // 原始 PDF URL（带时间戳）
        const originalPdfUrl = `https://pdf.dfcfw.com/pdf/H2_${item.art_code}_1.pdf?${timestamp}.pdf`
        // 通过后端代理访问（绕过防盗链）
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

// 获取财务数据 (东方财富真实API)
const fetchFinanceData = async (symbol, reportType = '', market = 'hk') => {
  try {
    let url
    
    if (market === 'a') {
      // A股财务数据API
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
      // 港股财务数据API
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
    
    if (!result.length) {
      console.warn('未获取到财务数据')
      return []
    }
    
    // 根据报告类型在前端过滤 - A股用REPORTDATE，港股用REPORT_DATE
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
    
    // A股和港股字段映射不同
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
          netProfitYoy: item.SJLTZ ?? null,  // 净利润同比
          revenue: revenue,
          revenueYoy: item.YSTZ ? item.YSTZ * 100 : null,  // 营收同比(原始是小数)
          grossProfit: null,
          grossProfitYoy: null,
          eps: item.BASIC_EPS ?? null,
          navps: item.BPS ?? null,
          npm: null,
          gpm: item.XSMLL ?? null,  // 毛利率
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

// K线图表组件
const KlineChart = memo(({ data, stockName, isMobile, dateRange }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !data?.values?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    // 计算 dataZoom 的起止位置（基于外部传入的时间区间）
    let startValue, endValue
    if (dateRange?.[0] && dateRange?.[1]) {
      const startDate = dateRange[0].format('YYYY-MM-DD')
      const endDate = dateRange[1].format('YYYY-MM-DD')
      startValue = startDate
      endValue = endDate
    }

    chart.setOption({
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      grid: [
        { left: 50, right: 10, top: 10, bottom: '28%' },
        { left: 50, right: 10, top: '75%', bottom: 50 }
      ],
      xAxis: [
        { type: 'category', data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, splitLine: { show: false } },
        { type: 'category', gridIndex: 1, data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, axisLabel: { show: false } }
      ],
      yAxis: [
        { scale: true, splitArea: { show: true } },
        { scale: true, gridIndex: 1, axisLabel: { show: false }, axisLine: { show: false }, splitLine: { show: false } }
      ],
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: [0, 1],
          startValue,
          endValue,
          bottom: 10,
          height: 30,
          borderColor: 'transparent',
          backgroundColor: '#f5f5f5',
          fillerColor: 'rgba(24, 144, 255, 0.2)',
          handleStyle: { color: '#1890ff' },
          moveHandleSize: 10,
          zoomLock: false,
          brushSelect: true,
        },
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          zoomOnMouseWheel: 'shift',
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
  }, [data, stockName, dateRange])

  return <div ref={chartRef} style={{ height: isMobile ? 250 : 350 }} />
})

// 财务图表组件
const FinanceChart = memo(({ data, metric, isMobile }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !data?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    const metricConfig = financeMetrics.find(m => m.key === metric)
    const categories = data.map(d => d.period)
    const values = data.map(d => d[metric])
    const yoyKey = metricConfig?.yoyKey
    const yoyValues = yoyKey ? data.map(d => d[yoyKey]) : null
    const hasYoy = yoyValues?.some(v => v !== null)

    chart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params) => {
          let html = `<div style="font-weight:bold;margin-bottom:4px">${params[0].axisValue}</div>`
          params.forEach(p => {
            if (p.seriesName === metricConfig.label) {
              html += `<div>${p.marker}${p.seriesName}: ${p.value?.toFixed(2)}${metricConfig.unit}</div>`
            } else if (p.seriesName === '同比' && p.value !== null) {
              const color = p.value >= 0 ? '#ec5a5a' : '#47b262'
              html += `<div>${p.marker}<span style="color:${color}">同比: ${p.value >= 0 ? '+' : ''}${p.value?.toFixed(2)}%</span></div>`
            }
          })
          return html
        }
      },
      legend: { data: hasYoy ? [metricConfig.label, '同比'] : [metricConfig.label], top: 0, right: 0, textStyle: { fontSize: 11 } },
      grid: { left: 50, right: hasYoy ? 50 : 20, top: 35, bottom: 50 },
      dataZoom: [{ type: 'slider', show: true, xAxisIndex: [0], start: Math.max(0, 100 - (10 / data.length * 100)), end: 100, height: 20, bottom: 5 }],
      xAxis: { type: 'category', data: categories, axisLabel: { fontSize: 10, rotate: 45 } },
      yAxis: [
        { type: 'value', name: metricConfig.unit, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed' } } },
        hasYoy ? { type: 'value', name: '%', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { show: false } } : null
      ].filter(Boolean),
      series: [
        {
          name: metricConfig.label,
          type: 'bar',
          data: values,
          itemStyle: { color: (params) => ['npm', 'gpm', 'roe', 'dar'].includes(metric) ? '#1890ff' : (values[params.dataIndex] >= 0 ? '#1890ff' : '#47b262') }
        },
        hasYoy ? { name: '同比', type: 'line', yAxisIndex: 1, data: yoyValues, symbol: 'circle', symbolSize: 4, lineStyle: { color: '#ff7a45' }, itemStyle: { color: '#ff7a45' } } : null
      ].filter(Boolean)
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, metric])

  return <div ref={chartRef} style={{ height: isMobile ? 220 : 280 }} />
})

// 基础信息卡片
const BasicInfoCard = memo(({ stock, isMobile }) => (
  <Card title="基础信息" size="small" style={{ marginBottom: 12 }}>
    <Row gutter={[12, 12]}>
      <Col span={8}>
        <Statistic title="最新价" value={stock.latestPrice} precision={2} valueStyle={{ color: stock.changePct >= 0 ? '#ec5a5a' : '#47b262', fontSize: isMobile ? 16 : 20 }} />
      </Col>
      <Col span={8}>
        <Statistic title="区间涨幅" value={stock.changePct} precision={2} suffix="%" prefix={stock.changePct >= 0 ? '+' : ''} valueStyle={{ color: stock.changePct >= 0 ? '#ec5a5a' : '#47b262', fontSize: isMobile ? 16 : 20 }} />
      </Col>
      <Col span={8}>
        <Statistic title="市值(亿)" value={stock.totalMarketCap ? (stock.totalMarketCap / 100000000).toFixed(0) : '-'} valueStyle={{ fontSize: isMobile ? 16 : 20 }} />
      </Col>
      <Col span={8}>
        <Statistic title="行业" value={stock.industry || '-'} valueStyle={{ fontSize: isMobile ? 13 : 14 }} />
      </Col>
      <Col span={8}>
        <Statistic title="市盈率" value={stock.peRatio?.toFixed(2) || '-'} valueStyle={{ fontSize: isMobile ? 16 : 20 }} />
      </Col>
      <Col span={8}>
        <Statistic title="市净率" value={stock.pbRatio?.toFixed(2) || '-'} valueStyle={{ fontSize: isMobile ? 16 : 20 }} />
      </Col>
    </Row>
  </Card>
))

// 新闻列表组件
const NewsList = memo(({ news }) => (
  <Card title="相关资讯" size="small">
    {news.length > 0 ? (
      <div style={{ maxHeight: 400, overflow: 'auto' }}>
        {news.map((item, index) => (
          <div key={index} style={{ padding: '6px 0', borderBottom: index < news.length - 1 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }} onClick={() => window.open(item.url, '_blank')}>
            <div style={{ fontSize: 13, color: '#333', lineHeight: 1.4, marginBottom: 2 }}>{item.title}</div>
            <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#999' }}>
              <span>{item.source}</span>
              <span>{item.date}</span>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <Empty description="暂无相关资讯" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    )}
  </Card>
))

// 公告表格组件
const AnnouncementTable = memo(({ 
  stockSymbol, 
  market = 'hk', 
  announcements = [], 
  total = 0,
  loading = false, 
  category = '0', 
  onCategoryChange,
  pagination,
  onPaginationChange 
}) => {
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [downloading, setDownloading] = useState(false)

  // 根据市场生成不同的外部链接
  let ths10jqkaUrl, exchangeUrl, exchangeName

  if (market === 'a') {
    ths10jqkaUrl = `https://stockpage.10jqka.com.cn/${stockSymbol}/news/#pub`
    exchangeUrl = `http://www.cninfo.com.cn/new/disclosure/stock?stockCode=${stockSymbol}`
    exchangeName = '巨潮资讯'
  } else {
    ths10jqkaUrl = `https://stockpage.10jqka.com.cn/HK${stockSymbol}/news/#pub`
    exchangeUrl = `https://www1.hkexnews.hk/search/titlesearch.xhtml?lang=zh&stock=${stockSymbol}`
    exchangeName = '港交所披露易'
  }

  // 下载单个 PDF
  const downloadPdf = async (record) => {
    try {
      const response = await fetch(record.pdfUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${record.title}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      message.error('下载失败')
    }
  }

  // 批量下载选中的 PDF
  const handleBatchDownload = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要下载的公告')
      return
    }
    
    setDownloading(true)
    const selectedItems = announcements.filter(item => selectedRowKeys.includes(item.code))
    
    for (const item of selectedItems) {
      await downloadPdf(item)
      // 间隔下载避免浏览器阻止
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    setDownloading(false)
    message.success(`已下载 ${selectedItems.length} 个公告`)
  }

  // 公告表格列定义
  const columns = [
    { 
      title: '日期', 
      dataIndex: 'date', 
      width: 100,
      render: (v) => <span style={{ fontSize: 12, color: '#666' }}>{v}</span>
    },
    { 
      title: '公告标题', 
      dataIndex: 'title', 
      ellipsis: true,
      render: (v, record) => (
        <a 
          href={record.pdfUrl}
          target="_blank" 
          rel="noopener noreferrer"
          style={{ fontSize: 13, color: '#333' }}
          onClick={(e) => e.stopPropagation()}
        >
          {v}
        </a>
      )
    },
    { 
      title: '分类', 
      dataIndex: 'category', 
      width: 120,
      render: (v) => v ? <span style={{ fontSize: 12, color: '#1890ff' }}>{v}</span> : '-'
    },
    { 
      title: '操作', 
      width: 80,
      render: (_, record) => (
        <Tooltip title="下载PDF">
          <Button 
            type="link" 
            size="small" 
            icon={<DownloadOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              downloadPdf(record)
            }}
          />
        </Tooltip>
      )
    },
  ]

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
  }

  return (
    <Card 
      title={
        <Space>
          <FileTextOutlined />
          <span>公司公告</span>
        </Space>
      } 
      size="small" 
      style={{ marginBottom: 12 }}
      extra={
        <Space size="small">
          {market === 'a' && selectedRowKeys.length > 0 && (
            <Button 
              type="primary" 
              size="small" 
              icon={<DownloadOutlined />}
              loading={downloading}
              onClick={handleBatchDownload}
            >
              下载选中({selectedRowKeys.length})
            </Button>
          )}
          <Button type="link" size="small" onClick={() => window.open(ths10jqkaUrl, '_blank')}>同花顺</Button>
          <Button type="link" size="small" onClick={() => window.open(exchangeUrl, '_blank')}>{exchangeName}</Button>
        </Space>
      }
    >
      {market === 'a' ? (
        <>
          {onCategoryChange && (
            <div style={{ marginBottom: 12 }}>
              <Radio.Group 
                value={category} 
                onChange={(e) => onCategoryChange(e.target.value)} 
                size="small"
                buttonStyle="solid"
              >
                {announcementCategories.map(opt => (
                  <Radio.Button key={opt.value} value={opt.value}>{opt.label}</Radio.Button>
                ))}
              </Radio.Group>
            </div>
          )}
          <Table
            size="small"
            loading={loading}
            dataSource={announcements}
            columns={columns}
            rowKey="code"
            rowSelection={rowSelection}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: total,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ['10', '20', '50'],
              showTotal: (t) => `共 ${t} 条`,
              onChange: onPaginationChange,
              onShowSizeChange: onPaginationChange,
            }}
          />
        </>
      ) : (
        <div style={{ color: '#666', fontSize: 13, padding: '12px 0' }}>
          港股公告请点击上方链接查看
        </div>
      )}
    </Card>
  )
})

// 财务表格列定义
const financeTableColumns = [
  { title: '报告期', dataIndex: 'period', width: 90, fixed: 'left' },
  { title: '归母净利润(亿)', dataIndex: 'netProfit', width: 110, render: (v) => <span style={{ color: v >= 0 ? '#1890ff' : '#47b262' }}>{v?.toFixed(2)}</span> },
  { title: '同比', dataIndex: 'netProfitYoy', width: 80, render: (v) => v !== null ? <span style={{ color: v >= 0 ? '#ec5a5a' : '#47b262' }}>{v >= 0 ? '+' : ''}{v?.toFixed(1)}%</span> : '-' },
  { title: '营业收入(亿)', dataIndex: 'revenue', width: 100, render: (v) => v?.toFixed(2) },
  { title: '收入同比', dataIndex: 'revenueYoy', width: 80, render: (v) => v !== null ? <span style={{ color: v >= 0 ? '#ec5a5a' : '#47b262' }}>{v >= 0 ? '+' : ''}{v?.toFixed(1)}%</span> : '-' },
  { title: '每股收益', dataIndex: 'eps', width: 80, render: (v) => v?.toFixed(3) },
  { title: 'ROE', dataIndex: 'roe', width: 70, render: (v) => v ? v.toFixed(1) + '%' : '-' },
]

// 股票详情组件
function StockDetail({ stock, market = 'hk', dateRange }) {
  const screens = useBreakpoint()
  const isMobile = !screens.md

  const [loading, setLoading] = useState(false)
  const [klineData, setKlineData] = useState(null)
  const [financeData, setFinanceData] = useState(null)
  const [financeMetric, setFinanceMetric] = useState('netProfit')
  const [stockNews, setStockNews] = useState([])
  const [reportType, setReportType] = useState('')
  const [announcements, setAnnouncements] = useState([])
  const [announcementTotal, setAnnouncementTotal] = useState(0)
  const [announcementPagination, setAnnouncementPagination] = useState({ current: 1, pageSize: 10 })
  const [announcementLoading, setAnnouncementLoading] = useState(false)
  const [announcementCategory, setAnnouncementCategory] = useState('0')

  const financeChartCardRef = useRef(null)
  const financeTableCardRef = useRef(null)

  // 加载财务数据
  const loadFinanceData = useCallback(async (symbol, type) => {
    const finance = await fetchFinanceData(symbol, type, market)
    setFinanceData(finance)
  }, [market])

  // 报告类型变化
  const handleReportTypeChange = useCallback((value) => {
    setReportType(value)
    if (stock) {
      loadFinanceData(stock.symbol, value)
    }
  }, [stock, loadFinanceData])

  // 加载公告数据
  const loadAnnouncements = useCallback(async (page, pageSize, category) => {
    if (!stock || market !== 'a') return
    
    setAnnouncementLoading(true)
    try {
      const result = await fetchAnnouncements(stock.symbol, page, pageSize, category)
      setAnnouncements(result.list)
      setAnnouncementTotal(result.total)
    } catch (error) {
      console.error('加载公告失败:', error)
    } finally {
      setAnnouncementLoading(false)
    }
  }, [stock, market])

  // 公告分类变化
  const handleAnnouncementCategoryChange = useCallback((value) => {
    setAnnouncementCategory(value)
    setAnnouncementPagination({ current: 1, pageSize: announcementPagination.pageSize })
    loadAnnouncements(1, announcementPagination.pageSize, value)
  }, [loadAnnouncements, announcementPagination.pageSize])

  // 公告分页变化
  const handleAnnouncementPaginationChange = useCallback((page, pageSize) => {
    setAnnouncementPagination({ current: page, pageSize })
    loadAnnouncements(page, pageSize, announcementCategory)
  }, [loadAnnouncements, announcementCategory])

  // 加载数据
  const loadData = useCallback(async () => {
    if (!stock) return
    
    setLoading(true)
    setKlineData(null)
    setFinanceData(null)
    setStockNews([])
    setFinanceMetric('netProfit')
    setReportType('')
    setAnnouncements([])
    setAnnouncementTotal(0)
    setAnnouncementPagination({ current: 1, pageSize: 10 })
    setAnnouncementCategory('0')

    try {
      const promises = [
        fetchStockKline(stock.symbol, market),
        fetchStockNews(stock.name),
        fetchFinanceData(stock.symbol, '', market),
      ]
      
      // A股才加载公告
      if (market === 'a') {
        promises.push(fetchAnnouncements(stock.symbol, 1, 10, '0'))
      }
      
      const results = await Promise.all(promises)
      setKlineData(results[0])
      setStockNews(results[1])
      setFinanceData(results[2])
      
      if (market === 'a' && results[3]) {
        setAnnouncements(results[3].list)
        setAnnouncementTotal(results[3].total)
      }
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      setLoading(false)
    }
  }, [stock, market])

  // stock 变化时加载数据
  useEffect(() => {
    if (stock) {
      loadData()
    }
  }, [stock, loadData])

  // 导出财务数据 Excel
  const handleExportFinanceExcel = useCallback(() => {
    if (!financeData?.length) {
      message.warning('没有数据可导出')
      return
    }

    const title = `${stock.name}(${stock.symbol}) 财务数据`
    const exportData = financeData.slice().reverse().map(item => ({
      '报告期': item.period,
      '归母净利润(亿)': item.netProfit?.toFixed(2),
      '净利润同比(%)': item.netProfitYoy?.toFixed(2),
      '营业收入(亿)': item.revenue?.toFixed(2),
      '收入同比(%)': item.revenueYoy?.toFixed(2),
      '毛利润(亿)': item.grossProfit?.toFixed(2),
      '毛利润同比(%)': item.grossProfitYoy?.toFixed(2),
      '每股收益': item.eps?.toFixed(3),
      '每股净资产': item.navps?.toFixed(2),
      '净利率(%)': item.npm?.toFixed(2),
      '毛利率(%)': item.gpm?.toFixed(2),
      'ROE(%)': item.roe?.toFixed(2),
      '资产负债率(%)': item.dar?.toFixed(2),
    }))

    const ws = XLSX.utils.json_to_sheet([])
    XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: 'A1' })
    XLSX.utils.sheet_add_aoa(ws, [[]], { origin: 'A2' })
    XLSX.utils.sheet_add_json(ws, exportData, { origin: 'A3' })
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }]
    
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '财务数据')
    XLSX.writeFile(wb, `${stock.name}_财务数据.xlsx`)
    message.success('导出成功')
  }, [financeData, stock])

  // 复制财务数据
  const handleCopyFinance = useCallback(async () => {
    if (!financeData?.length) {
      message.warning('没有数据可复制')
      return
    }

    const title = `${stock.name}(${stock.symbol}) 财务数据`
    const header = ['报告期', '归母净利润(亿)', '同比(%)', '营业收入(亿)', '同比(%)', '每股收益', 'ROE(%)'].join('\t')
    const rows = financeData.slice().reverse().map(item => [
      item.period,
      item.netProfit?.toFixed(2) || '-',
      item.netProfitYoy?.toFixed(2) || '-',
      item.revenue?.toFixed(2) || '-',
      item.revenueYoy?.toFixed(2) || '-',
      item.eps?.toFixed(3) || '-',
      item.roe?.toFixed(2) || '-',
    ].join('\t'))

    const text = [title, '', header, ...rows].join('\n')
    
    try {
      await navigator.clipboard.writeText(text)
      message.success(`已复制 ${financeData.length} 期财务数据`)
    } catch {
      message.error('复制失败')
    }
  }, [financeData, stock])

  // 截图财务数据图表
  const handleScreenshotFinanceChart = useCallback(async () => {
    if (!financeChartCardRef.current) {
      message.warning('没有数据可截图')
      return
    }

    const hide = message.loading('正在生成截图...', 0)
    try {
      const canvas = await html2canvas(financeChartCardRef.current, {
        backgroundColor: '#fff',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      
      const link = document.createElement('a')
      link.download = `${stock.name}_财务数据.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      
      hide()
      message.success('截图已保存')
    } catch (error) {
      hide()
      console.error('截图失败:', error)
      message.error('截图失败')
    }
  }, [stock])

  // 截图财务报表明细
  const handleScreenshotFinanceTable = useCallback(async () => {
    if (!financeTableCardRef.current) {
      message.warning('没有数据可截图')
      return
    }

    const hide = message.loading('正在生成截图...', 0)
    try {
      const canvas = await html2canvas(financeTableCardRef.current, {
        backgroundColor: '#fff',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      
      const link = document.createElement('a')
      link.download = `${stock.name}_财务报表明细.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      
      hide()
      message.success('截图已保存')
    } catch (error) {
      hide()
      console.error('截图失败:', error)
      message.error('截图失败')
    }
  }, [stock])

  if (!stock) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Empty description="请选择一只股票查看详情" />
      </div>
    )
  }

  // 移动端单列布局
  if (isMobile) {
    return (
      <Spin spinning={loading}>
        <div style={{ padding: 12 }}>
          <BasicInfoCard stock={stock} isMobile={isMobile} />
          
          <Card title="K线走势" size="small" style={{ marginBottom: 12 }}>
            {klineData?.values?.length > 0 ? (
              <KlineChart data={klineData} stockName={stock.name} isMobile={isMobile} dateRange={dateRange} />
            ) : (
              <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="暂无K线数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )}
          </Card>

          <AnnouncementTable 
            stockSymbol={stock.symbol} 
            market={market} 
            announcements={announcements}
            total={announcementTotal}
            loading={announcementLoading}
            category={announcementCategory}
            onCategoryChange={handleAnnouncementCategoryChange}
            pagination={announcementPagination}
            onPaginationChange={handleAnnouncementPaginationChange}
          />

          <Card 
            ref={financeChartCardRef}
            title="财务数据" 
            size="small" 
            style={{ marginBottom: 12 }}
            extra={
              <Space size="small" wrap>
                <Select value={reportType} onChange={handleReportTypeChange} options={reportTypeOptions} size="small" style={{ width: 80 }} />
              </Space>
            }
          >
            <div style={{ marginBottom: 8 }}>
              <Radio.Group value={financeMetric} onChange={(e) => setFinanceMetric(e.target.value)} size="small" buttonStyle="solid">
                {financeMetrics.slice(0, 4).map(m => (
                  <Radio.Button key={m.key} value={m.key} style={{ marginBottom: 4, fontSize: 12 }}>{m.label}</Radio.Button>
                ))}
              </Radio.Group>
            </div>
            {financeData?.length > 0 ? (
              <FinanceChart data={financeData} metric={financeMetric} isMobile={isMobile} />
            ) : (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="暂无财务数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )}
          </Card>

          {financeData?.length > 0 && (
            <Card ref={financeTableCardRef} title="财务报表明细" size="small" style={{ marginBottom: 12 }}>
              <Table size="small" pagination={{ pageSize: 5 }} scroll={{ x: 600 }} dataSource={financeData.slice().reverse()} rowKey="period" columns={financeTableColumns} />
            </Card>
          )}

          <NewsList news={stockNews} />
        </div>
      </Spin>
    )
  }

  // 桌面端左右布局
  return (
    <Spin spinning={loading}>
      <div style={{ padding: 16, display: 'flex', gap: 16, minHeight: 'calc(100vh - 55px)' }}>
        {/* 左侧：基础信息、K线走势、公司公告 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <BasicInfoCard stock={stock} isMobile={isMobile} />
          
          <Card title="K线走势" size="small" style={{ marginBottom: 12 }}>
            {klineData?.values?.length > 0 ? (
              <KlineChart data={klineData} stockName={stock.name} isMobile={isMobile} dateRange={dateRange} />
            ) : (
              <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="暂无K线数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )}
          </Card>

          <AnnouncementTable 
            stockSymbol={stock.symbol} 
            market={market} 
            announcements={announcements}
            total={announcementTotal}
            loading={announcementLoading}
            category={announcementCategory}
            onCategoryChange={handleAnnouncementCategoryChange}
            pagination={announcementPagination}
            onPaginationChange={handleAnnouncementPaginationChange}
          />
        </div>

        {/* 右侧：财务数据、财务报表明细、相关资讯 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Card 
            ref={financeChartCardRef}
            title="财务数据" 
            size="small" 
            style={{ marginBottom: 12 }}
            extra={
              <Space size="small" wrap>
                <Select value={reportType} onChange={handleReportTypeChange} options={reportTypeOptions} size="small" style={{ width: 80 }} />
                {financeData?.length > 0 && (
                  <>
                    <span style={{ fontSize: 11, color: '#999' }}>共{financeData.length}期</span>
                    <Button size="small" icon={<CopyOutlined />} onClick={handleCopyFinance} />
                    <Button size="small" icon={<DownloadOutlined />} onClick={handleExportFinanceExcel} />
                    <Button size="small" icon={<CameraOutlined />} onClick={handleScreenshotFinanceChart} />
                  </>
                )}
              </Space>
            }
          >
            <div style={{ marginBottom: 8 }}>
              <Radio.Group value={financeMetric} onChange={(e) => setFinanceMetric(e.target.value)} size="small" buttonStyle="solid">
                {financeMetrics.map(m => (
                  <Radio.Button key={m.key} value={m.key} style={{ marginBottom: 4 }}>
                    {m.label}
                    <Tooltip title={<div style={{ whiteSpace: 'pre-line' }}>{m.tip}</div>}>
                      <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 11, color: '#999' }} />
                    </Tooltip>
                  </Radio.Button>
                ))}
              </Radio.Group>
            </div>
            {financeData?.length > 0 ? (
              <FinanceChart data={financeData} metric={financeMetric} isMobile={isMobile} />
            ) : (
              <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="暂无财务数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )}
          </Card>

          {financeData?.length > 0 && (
            <Card 
              ref={financeTableCardRef}
              title="财务报表明细" 
              size="small" 
              style={{ marginBottom: 12 }}
              extra={
                <Space size="small">
                  <Button size="small" icon={<CopyOutlined />} onClick={handleCopyFinance} />
                  <Button size="small" icon={<DownloadOutlined />} onClick={handleExportFinanceExcel} />
                  <Button size="small" icon={<CameraOutlined />} onClick={handleScreenshotFinanceTable} />
                </Space>
              }
            >
              <Table
                size="small"
                pagination={{ pageSize: 8, showSizeChanger: false }}
                scroll={{ x: 600 }}
                dataSource={financeData.slice().reverse()}
                rowKey="period"
                columns={financeTableColumns}
              />
            </Card>
          )}

          <NewsList news={stockNews} />
        </div>
      </div>
    </Spin>
  )
}

export default memo(StockDetail)
