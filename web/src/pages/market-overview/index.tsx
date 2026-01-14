import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Spin, Grid, Tag, DatePicker, Collapse, Typography, List, Empty, Row, Col } from 'antd'
import { LinkOutlined, ReadOutlined, FileTextOutlined } from '@ant-design/icons'
import * as echarts from 'echarts'
import axios from 'axios'
import dayjs from 'dayjs'
import IndexMobile from './IndexMobile'
import { ExchangeKlineChart, ExchangeStatsCard } from './components'
import { useTheme, getEChartsTheme } from '../../contexts/ThemeContext'

const { useBreakpoint } = Grid
const { RangePicker } = DatePicker
const { Text, Paragraph } = Typography

// 指数配置
const indexConfigs = {
  hsi: { secid: '100.HSI', name: '恒生指数', color: '#1890ff' },
  sh: { secid: '1.000001', name: '上证指数', color: '#52c41a' },
}

// 汇率配置
const exchangeRateConfig = {
  usdcny: { secid: '133.USDCNH', name: '美元/离岸人民币', color: '#ff4d4f' },
}

// 日期预设（港股 + A股 + 通用）
const datePresets = [
  // 港股牛市阶段
  { label: '【港】24.01-至今 AI浪潮', value: [dayjs('2024-01-02'), dayjs().subtract(1, 'day')] },
  { label: '【港】16.02-18.01 南下资金', value: [dayjs('2016-02-01'), dayjs('2018-01-31')] },
  { label: '【港】03.04-07.10 SARS后', value: [dayjs('2003-04-01'), dayjs('2007-10-31')] },
  // A股牛市阶段
  { label: '【A】24.09-至今 政策牛', value: [dayjs('2024-09-24'), dayjs().subtract(1, 'day')] },
  { label: '【A】19.01-21.02 核心资产牛', value: [dayjs('2019-01-04'), dayjs('2021-02-18')] },
  { label: '【A】14.07-15.06 杠杆牛', value: [dayjs('2014-07-01'), dayjs('2015-06-12')] },
  { label: '【A】05.06-07.10 股改牛', value: [dayjs('2005-06-06'), dayjs('2007-10-16')] },
  // 通用预设
  { label: '近1周', value: [dayjs().subtract(7, 'day'), dayjs().subtract(1, 'day')] },
  { label: '近1月', value: [dayjs().subtract(1, 'month'), dayjs().subtract(1, 'day')] },
  { label: '近半年', value: [dayjs().subtract(6, 'month'), dayjs().subtract(1, 'day')] },
  { label: '近1年', value: [dayjs().subtract(1, 'year'), dayjs().subtract(1, 'day')] },
  { label: '近2年', value: [dayjs().subtract(2, 'year'), dayjs().subtract(1, 'day')] },
  { label: '近5年', value: [dayjs().subtract(5, 'year'), dayjs().subtract(1, 'day')] },
]

// 汇率新闻组件
function ExchangeRateNews() {
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchNews = async () => {
      setLoading(true)
      try {
        // 通过后端代理获取新浪财经外汇新闻
        const response = await axios.get('/api/v1/news/forex', { timeout: 10000 })
        
        const result = response.data?.result?.data || []
        const newsList = result.map(item => ({
          title: item.title,
          url: item.url,
          time: item.ctime ? dayjs.unix(item.ctime).format('MM-DD HH:mm') : ''
        }))
        setNews(newsList.slice(0, 10))
      } catch (error) {
        console.error('获取汇率新闻失败:', error)
        setNews([])
      } finally {
        setLoading(false)
      }
    }

    fetchNews()
    // 每5分钟刷新一次
    const timer = setInterval(fetchNews, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spin />
      </div>
    )
  }

  if (!news.length) {
    return <Empty description="暂无新闻" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <List
      size="small"
      dataSource={news}
      style={{ maxHeight: 400, overflow: 'auto' }}
      renderItem={(item) => (
        <List.Item style={{ padding: '8px 0', borderBottom: '1px dashed #f0f0f0' }}>
          <div style={{ width: '100%' }}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ 
                color: '#333', 
                fontSize: 13, 
                lineHeight: 1.6,
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={item.title}
            >
              <LinkOutlined style={{ marginRight: 6, color: '#1890ff' }} />
              {item.title}
            </a>
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
              {item.time}
            </div>
          </div>
        </List.Item>
      )}
    />
  )
}

export default function MarketOverview() {
  const screens = useBreakpoint()
  const isMobile = !screens.md

  if (isMobile) {
    return <IndexMobile />
  }

  return <MarketOverviewPC />
}

// PC 端组件
function MarketOverviewPC() {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)
  const dataRef = useRef({ dates: [], hsiMap: {}, shMap: {}, exchangeMap: {} })
  const { isDark, theme: currentTheme } = useTheme()
  const echartsTheme = getEChartsTheme(isDark)

  const [dateRange, setDateRange] = useState([null, null]) // 默认无日期区间
  const [loading, setLoading] = useState(false)
  const [exchangeStats, setExchangeStats] = useState(null)

  // 原始数据
  const [hsiData, setHsiData] = useState([])
  const [shData, setShData] = useState([])
  const [exchangeData, setExchangeData] = useState([])

  // 区间涨跌幅（通过 brush 选择计算）
  const [hsiChange, setHsiChange] = useState(null)
  const [shChange, setShChange] = useState(null)
  const [exchangeChange, setExchangeChange] = useState(null)

  // 获取K线数据
  const fetchKlineData = useCallback(async (secid, startDate, endDate) => {
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&ut=7eea3edcaed734bea9cbfc24409ed989&klt=101&fqt=1&secid=${secid}&beg=${startDate}&end=${endDate}`
    const response = await axios.get(url)
    const klines = response.data?.data?.klines || []
    return klines.map(item => {
      const fields = item.split(',')
      return {
        date: fields[0],
        close: parseFloat(fields[2])
      }
    })
  }, [])

  // 计算区间涨跌幅
  const calculateRangeChange = useCallback((dataMap, dates, startDate, endDate) => {
    if (!dates.length) return null
    
    // 找到区间内的起始和结束索引
    let startIdx = dates.findIndex(d => d >= startDate)
    let endIdx = dates.findIndex(d => d >= endDate)
    if (startIdx === -1) startIdx = 0
    if (endIdx === -1) endIdx = dates.length - 1
    
    const startDateStr = dates[startIdx]
    const endDateStr = dates[endIdx]
    
    const startClose = dataMap[startDateStr]
    const endClose = dataMap[endDateStr]
    
    if (startClose && endClose) {
      return ((endClose - startClose) / startClose * 100).toFixed(2)
    }
    return null
  }, [])

  // 更新区间涨跌幅
  const updateRangeChanges = useCallback((startDate, endDate) => {
    const { dates, hsiMap, shMap, exchangeMap } = dataRef.current
    setHsiChange(calculateRangeChange(hsiMap, dates, startDate, endDate))
    setShChange(calculateRangeChange(shMap, dates, startDate, endDate))
    setExchangeChange(calculateRangeChange(exchangeMap, dates, startDate, endDate))
  }, [calculateRangeChange])

  // 加载所有数据
  const loadAllData = useCallback(async () => {
    setLoading(true)
    // 加载更长时间的数据以支持滚动
    const startDate = '20000101'
    const endDate = dayjs().format('YYYYMMDD')

    try {
      const [hsiRaw, shRaw, exchangeRaw] = await Promise.all([
        fetchKlineData(indexConfigs.hsi.secid, startDate, endDate),
        fetchKlineData(indexConfigs.sh.secid, startDate, endDate),
        fetchKlineData(exchangeRateConfig.usdcny.secid, startDate, endDate),
      ])

      setHsiData(hsiRaw)
      setShData(shRaw)
      setExchangeData(exchangeRaw)

      // 构建数据映射
      const allDates = new Set()
      hsiRaw.forEach(d => allDates.add(d.date))
      shRaw.forEach(d => allDates.add(d.date))
      exchangeRaw.forEach(d => allDates.add(d.date))
      const dates = Array.from(allDates).sort()

      const hsiMap = {}
      hsiRaw.forEach(d => { hsiMap[d.date] = d.close })
      const shMap = {}
      shRaw.forEach(d => { shMap[d.date] = d.close })
      const exchangeMap = {}
      exchangeRaw.forEach(d => { exchangeMap[d.date] = d.close })

      dataRef.current = { dates, hsiMap, shMap, exchangeMap }

      // 如果有日期区间，计算涨跌幅
      if (dateRange[0] && dateRange[1]) {
        const rangeStart = dateRange[0].format('YYYY-MM-DD')
        const rangeEnd = dateRange[1].format('YYYY-MM-DD')
        setHsiChange(calculateRangeChange(hsiMap, dates, rangeStart, rangeEnd))
        setShChange(calculateRangeChange(shMap, dates, rangeStart, rangeEnd))
        setExchangeChange(calculateRangeChange(exchangeMap, dates, rangeStart, rangeEnd))
      }

    } catch (error) {
      console.error('获取数据失败:', error)
    } finally {
      setLoading(false)
    }
  }, [fetchKlineData, calculateRangeChange, dateRange])

  // 初始加载
  useEffect(() => {
    loadAllData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 初始化图表
  useEffect(() => {
    if (!chartRef.current) return

    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    // 监听 brush 事件
    chart.on('brushEnd', (params) => {
      const areas = params.areas
      if (areas?.length > 0) {
        const range = areas[0].coordRange
        if (range?.length === 2) {
          const { dates } = dataRef.current
          let startDateStr, endDateStr
          
          if (typeof range[0] === 'number') {
            const startIdx = Math.max(0, Math.round(range[0]))
            const endIdx = Math.min(dates.length - 1, Math.round(range[1]))
            startDateStr = dates[startIdx]
            endDateStr = dates[endIdx]
          } else {
            startDateStr = range[0]
            endDateStr = range[1]
          }
          
          if (startDateStr && endDateStr) {
            setDateRange([dayjs(startDateStr), dayjs(endDateStr)])
            updateRangeChanges(startDateStr, endDateStr)
          }
        }
      }
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [updateRangeChanges])

  // 更新图表
  useEffect(() => {
    if (!chartInstanceRef.current) return
    if (!hsiData.length && !shData.length && !exchangeData.length) return

    const { dates, hsiMap, shMap, exchangeMap } = dataRef.current

    // 对齐数据到同一日期轴
    const hsiValues = dates.map(date => hsiMap[date] ?? null)
    const shValues = dates.map(date => shMap[date] ?? null)
    const exchangeValues = dates.map(date => exchangeMap[date] ?? null)

    // 计算显示范围
    let zoomStart = 0
    let zoomEnd = 100
    let startIdx = 0
    let endIdx = dates.length - 1
    let hasBrush = false

    if (dateRange[0] && dateRange[1]) {
      hasBrush = true
      const rangeStart = dateRange[0].format('YYYY-MM-DD')
      const rangeEnd = dateRange[1].format('YYYY-MM-DD')
      startIdx = dates.findIndex(d => d >= rangeStart)
      endIdx = dates.findIndex(d => d >= rangeEnd)
      if (startIdx === -1) startIdx = 0
      if (endIdx === -1) endIdx = dates.length - 1

      // 计算 dataZoom 的显示范围，留一些边距
      const totalLen = dates.length
      const rangeLen = endIdx - startIdx + 1
      const padding = rangeLen * 0.1
      zoomStart = Math.max(0, ((startIdx - padding) / totalLen) * 100)
      zoomEnd = Math.min(100, ((endIdx + padding) / totalLen) * 100)
    }

    const option = {
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: echartsTheme.tooltip.backgroundColor,
        borderColor: echartsTheme.tooltip.borderColor,
        borderWidth: 1,
        textStyle: { color: echartsTheme.tooltip.textStyle.color, fontSize: 12 },
        formatter: (params) => {
          if (!params || !params.length) return ''
          const date = params[0].axisValue
          let html = `<div style="font-weight:bold;margin-bottom:4px">${date}</div>`
          params.forEach(p => {
            if (p.value !== null && p.value !== undefined) {
              html += `<div><span style="color:${p.color}">●</span> ${p.seriesName}: ${p.value.toFixed(2)}</div>`
            }
          })
          return html
        }
      },
      legend: {
        data: [exchangeRateConfig.usdcny.name, indexConfigs.hsi.name, indexConfigs.sh.name],
        top: 10,
        textStyle: { fontSize: 12, color: echartsTheme.legend.textStyle.color }
      },
      toolbox: {
        feature: {
          brush: { type: ['lineX', 'clear'] }
        },
        right: 10,
        top: 5,
        itemSize: 15,
        iconStyle: { borderColor: isDark ? '#888' : '#666' }
      },
      brush: {
        xAxisIndex: 'all',
        brushLink: 'all',
        outOfBrush: { colorAlpha: 0.3 },
        brushStyle: echartsTheme.brush.brushStyle
      },
      grid: {
        left: '3%',
        right: '12%',
        top: 60,
        bottom: 60,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLabel: { fontSize: 10, color: echartsTheme.axisLabel.color },
        axisLine: { lineStyle: { color: echartsTheme.axisLine.lineStyle.color } }
      },
      yAxis: [
        {
          type: 'value',
          name: '汇率',
          position: 'right',
          axisLine: { show: true, lineStyle: { color: exchangeRateConfig.usdcny.color } },
          axisLabel: { fontSize: 10, color: exchangeRateConfig.usdcny.color },
          splitLine: { show: true, lineStyle: { type: 'dashed', color: echartsTheme.splitLine.lineStyle.color } },
          scale: true,
        },
        {
          type: 'value',
          name: '恒生指数',
          position: 'left',
          axisLine: { show: true, lineStyle: { color: indexConfigs.hsi.color } },
          axisLabel: { fontSize: 10, color: indexConfigs.hsi.color },
          splitLine: { show: false },
          scale: true,
        },
        {
          type: 'value',
          name: '上证指数',
          position: 'right',
          offset: 60,
          axisLine: { show: true, lineStyle: { color: indexConfigs.sh.color } },
          axisLabel: { fontSize: 10, color: indexConfigs.sh.color },
          splitLine: { show: false },
          scale: true,
        }
      ],
      dataZoom: [
        { 
          type: 'inside', 
          start: zoomStart, 
          end: zoomEnd, 
          minSpan: 0 
        },
        { 
          type: 'slider', 
          start: zoomStart, 
          end: zoomEnd, 
          height: 20, 
          bottom: 10, 
          minSpan: 0,
          backgroundColor: echartsTheme.dataZoom.backgroundColor,
          dataBackground: {
            lineStyle: { color: echartsTheme.dataZoom.dataBackgroundColor },
            areaStyle: { color: echartsTheme.dataZoom.dataBackgroundColor }
          },
          fillerColor: echartsTheme.dataZoom.fillerColor,
          handleStyle: { color: echartsTheme.dataZoom.handleColor },
          textStyle: { color: echartsTheme.dataZoom.textStyle.color }
        }
      ],
      series: [
        {
          name: exchangeRateConfig.usdcny.name,
          type: 'line',
          yAxisIndex: 0,
          data: exchangeValues,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: exchangeRateConfig.usdcny.color },
          itemStyle: { color: exchangeRateConfig.usdcny.color }
        },
        {
          name: indexConfigs.hsi.name,
          type: 'line',
          yAxisIndex: 1,
          data: hsiValues,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: indexConfigs.hsi.color },
          itemStyle: { color: indexConfigs.hsi.color }
        },
        {
          name: indexConfigs.sh.name,
          type: 'line',
          yAxisIndex: 2,
          data: shValues,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: indexConfigs.sh.color },
          itemStyle: { color: indexConfigs.sh.color }
        }
      ]
    }

    chartInstanceRef.current.setOption(option, true)

    // 设置 brush 区间（仅当有日期范围时）
    if (hasBrush) {
      setTimeout(() => {
        const actualStart = dates[startIdx]
        const actualEnd = dates[endIdx]
        chartInstanceRef.current?.dispatchAction({
          type: 'brush',
          areas: [{ brushType: 'lineX', coordRange: [actualStart, actualEnd], xAxisIndex: 0 }]
        })
      }, 100)
    } else {
      // 清除 brush
      chartInstanceRef.current.dispatchAction({ type: 'brush', command: 'clear', areas: [] })
    }
  }, [hsiData, shData, exchangeData, dateRange, echartsTheme, isDark])

  // 日期范围变化（支持清空）
  const handleDateRangeChange = (dates) => {
    // 清空日期
    if (!dates || !dates[0] || !dates[1]) {
      setDateRange([null, null])
      setHsiChange(null)
      setShChange(null)
      setExchangeChange(null)
      // 清除图表 brush
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispatchAction({ type: 'brush', command: 'clear', areas: [] })
      }
      return
    }

    setDateRange(dates)
    const rangeStart = dates[0].format('YYYY-MM-DD')
    const rangeEnd = dates[1].format('YYYY-MM-DD')
    updateRangeChanges(rangeStart, rangeEnd)

    // 更新图表 brush
    if (chartInstanceRef.current) {
      const { dates: allDates } = dataRef.current
      let startIdx = allDates.findIndex(d => d >= rangeStart)
      let endIdx = allDates.findIndex(d => d >= rangeEnd)
      if (startIdx === -1) startIdx = 0
      if (endIdx === -1) endIdx = allDates.length - 1

      const totalLen = allDates.length
      const rangeLen = endIdx - startIdx + 1
      const padding = rangeLen * 0.1
      const zoomStart = Math.max(0, ((startIdx - padding) / totalLen) * 100)
      const zoomEnd = Math.min(100, ((endIdx + padding) / totalLen) * 100)

      chartInstanceRef.current.dispatchAction({ type: 'dataZoom', start: zoomStart, end: zoomEnd })
      chartInstanceRef.current.dispatchAction({ type: 'brush', command: 'clear', areas: [] })

      setTimeout(() => {
        const actualStart = allDates[startIdx]
        const actualEnd = allDates[endIdx]
        chartInstanceRef.current?.dispatchAction({
          type: 'brush',
          areas: [{ brushType: 'lineX', coordRange: [actualStart, actualEnd], xAxisIndex: 0 }]
        })
      }, 100)
    }
  }

  // 渲染涨跌幅标签
  const renderChangeTag = (name, change, color) => {
    if (change === null) return null
    const isUp = parseFloat(change) >= 0
    return (
      <Tag color={isUp ? 'red' : 'green'} style={{ fontSize: 12 }}>
        <span style={{ color }}>{name}</span>: {isUp ? '+' : ''}{change}%
      </Tag>
    )
  }

  return (
    <div>
      {/* 上部：汇率走势图 + K线图 */}
      <Row gutter={16}>
        {/* 左侧：汇率走势对比图 */}
        <Col span={14}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 'bold' }}>汇率走势</span>
                <RangePicker
                  value={dateRange}
                  onChange={handleDateRangeChange}
                  allowClear={true}
                  size="small"
                  style={{ width: 240 }}
                  presets={datePresets}
                />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {renderChangeTag('美元/CNH', exchangeChange, exchangeRateConfig.usdcny.color)}
                  {renderChangeTag('恒指', hsiChange, indexConfigs.hsi.color)}
                  {renderChangeTag('上证', shChange, indexConfigs.sh.color)}
                </div>
              </div>
            }
            extra={<span style={{ fontSize: 11, color: '#999' }}>（画笔选择区间）</span>}
            size="small"
            styles={{ body: { padding: 0 } }}
          >
            <div style={{ position: 'relative' }}>
              {loading && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', zIndex: 10 }}>
                  <Spin size="large" />
                </div>
              )}
              <div ref={chartRef} style={{ height: 450 }} />
            </div>
          </Card>
        </Col>

        {/* 右侧：汇率K线图 + 汇率统计卡片 */}
        <Col span={10}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 汇率统计卡片 */}
            <ExchangeStatsCard stats={exchangeStats} isDark={isDark} />
            
            {/* 汇率K线图 */}
            <Card size="small" styles={{ body: { padding: 12 } }}>
              <ExchangeKlineChart height={420} onStatsChange={setExchangeStats} />
            </Card>
          </div>
        </Col>
      </Row>

      {/* 底部内容：左侧科普 + 右侧新闻 */}
      <div style={{ display: 'flex', gap: 16, padding: 16, marginTop: 16, borderRadius: 8, background: currentTheme.custom.bgColorSecondary }}>
        {/* 左侧：汇率科普内容 */}
        <Card 
          title={<span><ReadOutlined style={{ marginRight: 8 }} />汇率基础科普</span>}
          size="small" 
          style={{ flex: 1 }}
          styles={{ body: { padding: '8px 16px' } }}
        >
          <Collapse
            ghost
            size="small"
            defaultActiveKey={['basic']}
            items={[
              {
                key: 'basic',
                label: <Text strong>汇率基础知识</Text>,
                children: (
                  <div style={{ fontSize: 13, lineHeight: 1.8, color: '#666' }}>
                    <Paragraph style={{ marginBottom: 8 }}>
                      <Text strong>美元/离岸人民币（USDCNH）</Text>：表示1美元可以兑换多少离岸人民币。
                      <Text type="danger">汇率上涨</Text>意味着人民币贬值（美元升值），
                      <Text type="success">汇率下跌</Text>意味着人民币升值（美元贬值）。
                    </Paragraph>
                    <Paragraph style={{ marginBottom: 0 }}>
                      离岸人民币（CNH）是在中国大陆以外交易的人民币，相比在岸人民币（CNY）更能反映市场供需，波动也更大。
                    </Paragraph>
                  </div>
                ),
              },
              {
                key: 'correlation',
                label: <Text strong>汇率与股市的关联性</Text>,
                children: (
                  <div style={{ fontSize: 13, lineHeight: 1.8, color: '#666' }}>
                    <Paragraph style={{ marginBottom: 12 }}>
                      <Text strong style={{ color: '#1890ff' }}>港股（恒生指数）</Text>：
                      港股以港币计价，但大量成分股的业务和资产在内地，因此与人民币汇率高度相关。
                      人民币贬值时，以美元计价的港股资产价值下降，外资倾向流出，港股承压；
                      人民币升值时，外资流入，港股受益。
                    </Paragraph>
                    <Paragraph style={{ marginBottom: 0 }}>
                      <Text strong style={{ color: '#52c41a' }}>A股（上证指数）</Text>：
                      A股以人民币计价，汇率影响相对间接。但人民币贬值预期会导致资本外流压力，
                      影响市场流动性和投资者情绪；人民币升值则有利于吸引外资（北向资金）流入。
                    </Paragraph>
                  </div>
                ),
              },
              {
                key: 'impact',
                label: <Text strong>汇率变动对行业的影响</Text>,
                children: (
                  <div style={{ fontSize: 13, lineHeight: 1.8, color: '#666' }}>
                    <div style={{ marginBottom: 16 }}>
                      <Text strong type="danger">人民币贬值（汇率上涨）利好的行业：</Text>
                      <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                        <li><Text strong>出口型企业</Text>：纺织服装、家电、电子制造、玩具等，产品出口以美元结算，贬值提升竞争力和利润</li>
                        <li><Text strong>航运/港口</Text>：出口增加带动运输需求</li>
                        <li><Text strong>黄金/贵金属</Text>：避险需求上升，金价通常上涨</li>
                      </ul>
                      <Text type="secondary">代表个股：申洲国际、海尔智家、立讯精密、招金矿业等</Text>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <Text strong type="success">人民币升值（汇率下跌）利好的行业：</Text>
                      <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                        <li><Text strong>航空公司</Text>：大量美元负债，升值减少汇兑损失；航油以美元计价，成本下降</li>
                        <li><Text strong>造纸/进口依赖型</Text>：原材料进口成本下降</li>
                        <li><Text strong>房地产</Text>：人民币资产吸引力上升，外资流入</li>
                        <li><Text strong>金融/银行</Text>：外资流入增加市场流动性</li>
                      </ul>
                      <Text type="secondary">代表个股：中国国航、南方航空、万科、招商银行等</Text>
                    </div>
                    <div>
                      <Text strong type="warning">受汇率波动影响较大的行业：</Text>
                      <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                        <li><Text strong>科技/半导体</Text>：进口设备和原材料多，但产品也有出口，影响复杂</li>
                        <li><Text strong>汽车</Text>：进口零部件与出口整车并存，需具体分析</li>
                        <li><Text strong>石油石化</Text>：原油进口以美元计价，但产品内销为主</li>
                      </ul>
                    </div>
                  </div>
                ),
              },
              {
                key: 'tips',
                label: <Text strong>投资提示</Text>,
                children: (
                  <div style={{ fontSize: 13, lineHeight: 1.8, color: '#666' }}>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      <li>汇率只是影响股价的因素之一，需结合基本面、估值、市场情绪等综合判断</li>
                      <li>短期汇率波动对股价影响有限，持续性趋势影响更大</li>
                      <li>港股对汇率更敏感，A股相对滞后，可关注北向资金流向作为参考</li>
                      <li>汇率快速贬值时，避险情绪上升，整体市场可能承压</li>
                      <li>关注央行政策和中美利差变化，这些是汇率走势的重要驱动因素</li>
                    </ul>
                  </div>
                ),
              },
            ]}
          />
        </Card>

        {/* 右侧：汇率新闻 */}
        <Card 
          title={<span><FileTextOutlined style={{ marginRight: 8 }} />汇率相关新闻</span>}
          size="small" 
          style={{ flex: 1 }}
          styles={{ body: { padding: '8px 16px' } }}
        >
          <ExchangeRateNews />
        </Card>
      </div>
    </div>
  )
}
