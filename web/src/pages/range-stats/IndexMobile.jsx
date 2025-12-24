import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Card, Tag, Selector, SpinLoading, Empty, InfiniteScroll, Button, ActionSheet, Toast } from 'antd-mobile'
import { MoreOutline } from 'antd-mobile-icons'
import Canvas from '@antv/f2-react'
import { Chart, Line, Axis, Tooltip, Area } from '@antv/f2'
import { useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'

// 颜色配置
const upColor = '#ec5a5a'
const downColor = '#47b262' 

// 恒生指数配置
const indexConfig = { secid: '100.HSI', name: '恒生指数' }

// 日期区间预设
const datePresets = [
  { label: '近1周', value: 'week' },
  { label: '近1月', value: 'month' },
  { label: '近3月', value: '3month' },
  { label: '近6月', value: '6month' },
  { label: '近1年', value: 'year' },
  { label: '今年以来', value: 'ytd' },
  { label: 'AI浪潮(24.01-)', value: 'ai' },
]

// 市值筛选选项
const marketCapOptions = [
  { label: '不限', value: 'none' },
  { label: '<50亿', value: 'small' },
  { label: '50-200亿', value: 'medium' },
  { label: '200-1000亿', value: 'large' },
  { label: '>1000亿', value: 'xlarge' },
  { label: '>2000亿', value: 'xxlarge' },
]

// 涨幅筛选选项
const changePctOptions = [
  { label: '≥30%', value: '30' },
  { label: '≥50%', value: '50' },
  { label: '≥60%', value: '60' },
  { label: '≥80%', value: '80' },
  { label: '≥100%', value: '100' },
]

// 根据预设值获取日期范围
const getDateRangeByPreset = (preset) => {
  const now = dayjs().subtract(1, 'day')
  switch (preset) {
    case 'week': return [dayjs().subtract(7, 'day'), now]
    case 'month': return [dayjs().subtract(1, 'month'), now]
    case '3month': return [dayjs().subtract(3, 'month'), now]
    case '6month': return [dayjs().subtract(6, 'month'), now]
    case 'year': return [dayjs().subtract(1, 'year'), now]
    case 'ytd': return [dayjs().startOf('year'), now]
    case 'ai': return [dayjs('2024-01-02'), now]
    default: return [dayjs('2024-01-02'), now]
  }
}

// 解析 K 线数据
const parseKlineData = (rawData) => {
  return rawData.map((item) => {
    const fields = item.split(',')
    return {
      date: fields[0],
      close: parseFloat(fields[2]),
      open: parseFloat(fields[1]),
    }
  })
}

// 迷你 K 线图组件
const MiniKlineChart = ({ data, dateRange }) => {
  if (!data?.length) return null

  // 根据日期范围过滤数据
  const filteredData = useMemo(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) return data
    const startStr = dateRange[0].format('YYYY-MM-DD')
    const endStr = dateRange[1].format('YYYY-MM-DD')
    return data.filter(d => d.date >= startStr && d.date <= endStr)
  }, [data, dateRange])

  if (!filteredData.length) return null

  const startClose = filteredData[0]?.close || 0
  const endClose = filteredData[filteredData.length - 1]?.close || 0
  const changePct = startClose ? ((endClose - startClose) / startClose) * 100 : 0
  const color = changePct >= 0 ? upColor : downColor

  // 计算 Y 轴范围
  const closes = filteredData.map(d => d.close)
  const minClose = Math.min(...closes)
  const maxClose = Math.max(...closes)
  const padding = (maxClose - minClose) * 0.1
  const yMin = Math.floor(minClose - padding)
  const yMax = Math.ceil(maxClose + padding)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 'bold', color: '#333' }}>{indexConfig.name}</span>
        <Tag color={changePct >= 0 ? 'danger' : 'success'} fill="solid" style={{ fontSize: 13 }}>
          {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
        </Tag>
      </div>
      <div style={{ height: 120 }}>
        <Canvas pixelRatio={window.devicePixelRatio}>
          <Chart 
            data={filteredData}
            scale={{
              close: { min: yMin, max: yMax, tickCount: 4 }
            }}
          >
            <Axis field="date" tickCount={4} style={{ label: { fontSize: 10 } }} />
            <Axis field="close" tickCount={4} style={{ label: { fontSize: 10 } }} />
            <Area x="date" y="close" color={`l(90) 0:${color}40 1:${color}05`} />
            <Line x="date" y="close" color={color} style={{ lineWidth: 1.5 }} />
            <Tooltip showCrosshairs />
          </Chart>
        </Canvas>
      </div>
    </div>
  )
}

// 股票列表项组件 - 自定义紧凑布局
const StockItem = ({ stock, rank, onClick }) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      padding: '8px 12px',
      borderBottom: '1px solid #f0f0f0',
      background: '#fff',
    }}
  >
    <Tag
      color={rank <= 3 ? 'danger' : rank <= 10 ? 'warning' : 'default'}
      style={{ width: 22, textAlign: 'center', fontSize: 10, padding: '0 2px', flexShrink: 0 }}
    >
      {rank}
    </Tag>
    <div style={{ flex: 1, marginLeft: 8, minWidth: 0 }}>
      <div style={{ fontWeight: 500, fontSize: 13 }}>{stock.name}</div>
      <div style={{ fontSize: 10, color: '#999' }}>
        {stock.symbol} · 现价: {stock.latestPrice?.toFixed(2)}
      </div>
    </div>
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 'bold', color: stock.changePct >= 0 ? upColor : downColor }}>
        {stock.changePct >= 0 ? '+' : ''}{stock.changePct?.toFixed(1)}%
      </div>
      <div style={{ fontSize: 10, color: '#999' }}>
        {stock.totalMarketCap ? `${(stock.totalMarketCap / 100000000).toFixed(0)}亿` : '-'}
      </div>
    </div>
  </div>
)

// 主组件
export default function IndexMobile() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const [datePreset, setDatePreset] = useState('ytd')
  const [dateRange, setDateRange] = useState(getDateRangeByPreset('ytd'))
  const [minChangePct, setMinChangePct] = useState('60')
  const [marketCapFilter, setMarketCapFilter] = useState('xxlarge')
  const [selectedIndustry, setSelectedIndustry] = useState('')
  
  const [loading, setLoading] = useState(false)
  const [stockData, setStockData] = useState([])
  const [industryStats, setIndustryStats] = useState([])
  const [klineData, setKlineData] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [actionSheetVisible, setActionSheetVisible] = useState(false)
  
  const pageRef = useRef(1)
  const totalRef = useRef(0)
  const listCardRef = useRef(null)

  // 获取 K 线数据
  const fetchKlineData = useCallback(async () => {
    try {
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${indexConfig.secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=20230101&end=${dayjs().format('YYYYMMDD')}`
      const response = await axios.get(url)
      const rawData = response.data?.data?.klines || []
      setKlineData(parseKlineData(rawData))
    } catch (error) {
      console.error('获取 K 线数据失败:', error)
    }
  }, [])

  // 获取市值范围
  const getMarketCapRange = useCallback(() => {
    switch (marketCapFilter) {
      case 'small': return { min: 0, max: 50 }
      case 'medium': return { min: 50, max: 200 }
      case 'large': return { min: 200, max: 1000 }
      case 'xlarge': return { min: 1000, max: 0 }
      case 'xxlarge': return { min: 2000, max: 0 }
      default: return { min: 0, max: 0 }
    }
  }, [marketCapFilter])

  // 获取股票数据
  const fetchStockData = useCallback(async (reset = false, industry = '') => {
    if (loading) return
    
    setLoading(true)
    try {
      const capRange = getMarketCapRange()
      const params = {
        start_date: dateRange[0].format('YYYYMMDD'),
        end_date: dateRange[1].format('YYYYMMDD'),
        min_change_pct: parseInt(minChangePct),
        min_market_cap: capRange.min,
        max_market_cap: capRange.max,
      }
      if (industry) params.industry = industry
      
      const response = await axios.get('/api/v1/stock/range', { params })
      const result = response.data
      
      if (result.data) {
        if (reset) {
          setStockData(result.data)
          pageRef.current = 1
        } else {
          setStockData(prev => [...prev, ...result.data])
        }
        totalRef.current = result.total || 0
        setHasMore(result.data.length >= 20)
        if (!industry) setIndustryStats(result.industryStats || [])
      }
    } catch (error) {
      console.error('获取股票数据失败:', error)
    } finally {
      setLoading(false)
    }
  }, [dateRange, minChangePct, getMarketCapRange, loading])

  // 日期预设变化
  const handleDatePresetChange = useCallback((value) => {
    if (!value?.length) return
    const preset = value[0]
    setDatePreset(preset)
    setDateRange(getDateRangeByPreset(preset))
  }, [])

  // 搜索
  const handleSearch = useCallback(() => {
    setSelectedIndustry('')
    setFilterVisible(false)
    fetchStockData(true, '')
  }, [fetchStockData])

  // 行业点击
  const handleIndustryClick = useCallback((industry) => {
    if (selectedIndustry === industry) {
      setSelectedIndustry('')
      fetchStockData(true, '')
    } else {
      setSelectedIndustry(industry)
      fetchStockData(true, industry)
    }
  }, [selectedIndustry, fetchStockData])

  // 打开详情 - 使用路由跳转
  const handleStockClick = useCallback((stock) => {
    navigate(`/stock/${stock.symbol}?name=${encodeURIComponent(stock.name)}`)
  }, [navigate])

  // 加载更多
  const loadMore = async () => {
    if (!hasMore || loading) return
    pageRef.current += 1
    await fetchStockData(false, selectedIndustry)
  }

  // 生成查询条件标题
  const getQueryTitle = useCallback(() => {
    const parts = [`区间涨幅 ${dateRange[0]?.format('YYYY-MM-DD')} ~ ${dateRange[1]?.format('YYYY-MM-DD')}`]
    parts.push(`涨幅≥${minChangePct}%`)
    const capRange = getMarketCapRange()
    if (capRange.min > 0 || capRange.max > 0) {
      if (capRange.max === 0) parts.push(`市值>${capRange.min}亿`)
      else if (capRange.min === 0) parts.push(`市值<${capRange.max}亿`)
      else parts.push(`市值${capRange.min}~${capRange.max}亿`)
    }
    if (selectedIndustry) parts.push(`行业:${selectedIndustry}`)
    return parts.join(' | ')
  }, [dateRange, minChangePct, getMarketCapRange, selectedIndustry])

  // 导出 Excel
  const handleExportExcel = useCallback(() => {
    if (!stockData.length) {
      Toast.show({ content: '没有数据可导出', position: 'bottom' })
      return
    }

    const title = getQueryTitle()
    const exportData = stockData.map((item, index) => ({
      '排名': index + 1,
      '代码': item.symbol,
      '名称': item.name,
      '起始价': item.startPrice?.toFixed(3),
      '结束价': item.endPrice?.toFixed(3),
      '涨幅(%)': item.changePct?.toFixed(2),
      '现价': item.latestPrice?.toFixed(2),
      '市值(亿)': item.totalMarketCap ? (item.totalMarketCap / 100000000).toFixed(2) : '-',
      '市盈率': item.peRatio?.toFixed(2) || '-',
      '市净率': item.pbRatio?.toFixed(2) || '-',
      '换手率(%)': item.turnoverRate?.toFixed(2) || '-',
    }))

    const ws = XLSX.utils.json_to_sheet([])
    XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: 'A1' })
    XLSX.utils.sheet_add_aoa(ws, [[]], { origin: 'A2' })
    XLSX.utils.sheet_add_json(ws, exportData, { origin: 'A3' })
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }]
    
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '区间涨幅')
    
    const fileName = `区间涨幅_${dateRange[0]?.format('YYYYMMDD')}_${dateRange[1]?.format('YYYYMMDD')}.xlsx`
    XLSX.writeFile(wb, fileName)
    Toast.show({ content: '导出成功', position: 'bottom' })
  }, [stockData, dateRange, getQueryTitle])

  // 复制到剪贴板
  const handleCopy = useCallback(async () => {
    if (!stockData.length) {
      Toast.show({ content: '没有数据可复制', position: 'bottom' })
      return
    }

    const title = getQueryTitle()
    const header = ['排名', '代码', '名称', '涨幅(%)', '现价', '市值(亿)'].join('\t')
    const rows = stockData.map((item, index) => [
      index + 1,
      item.symbol,
      item.name,
      item.changePct?.toFixed(2),
      item.latestPrice?.toFixed(2),
      item.totalMarketCap ? (item.totalMarketCap / 100000000).toFixed(0) : '-',
    ].join('\t'))

    const text = [title, '', header, ...rows].join('\n')
    
    try {
      await navigator.clipboard.writeText(text)
      Toast.show({ content: `已复制 ${stockData.length} 条数据`, position: 'bottom' })
    } catch {
      Toast.show({ content: '复制失败', position: 'bottom' })
    }
  }, [stockData, getQueryTitle])

  // 截图功能
  const handleScreenshot = useCallback(async () => {
    if (!listCardRef.current || !stockData.length) {
      Toast.show({ content: '没有数据可截图', position: 'bottom' })
      return
    }

    Toast.show({ content: '正在生成截图...', position: 'bottom', duration: 0 })
    
    try {
      const canvas = await html2canvas(listCardRef.current, {
        backgroundColor: '#fff',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      
      const link = document.createElement('a')
      link.download = `区间涨幅_${dateRange[0]?.format('YYYYMMDD')}_${dateRange[1]?.format('YYYYMMDD')}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      
      Toast.clear()
      Toast.show({ content: '截图已保存', position: 'bottom' })
    } catch (error) {
      Toast.clear()
      console.error('截图失败:', error)
      Toast.show({ content: '截图失败', position: 'bottom' })
    }
  }, [stockData, dateRange])

  // 操作菜单
  const actionSheetActions = [
    { text: '复制数据', key: 'copy', onClick: handleCopy },
    { text: '导出Excel', key: 'excel', onClick: handleExportExcel },
    { text: '截图保存', key: 'screenshot', onClick: handleScreenshot },
  ]

  // 初始化
  useEffect(() => {
    fetchKlineData()
    fetchStockData(true, '')
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* K 线图区域 */}
      <Card style={{ margin: 8, borderRadius: 8 }}>
        <MiniKlineChart data={klineData} dateRange={dateRange} />
      </Card>

      {/* 快捷筛选 */}
      <Card style={{ margin: '0 8px 8px', borderRadius: 8, padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#666', flexShrink: 0 }}>区间:</span>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Selector
              options={datePresets}
              value={[datePreset]}
              onChange={handleDatePresetChange}
              style={{
                '--border-radius': '4px',
                '--checked-color': '#1677ff',
                '--checked-text-color': '#fff',
                '--padding': '4px 8px',
                fontSize: 11,
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#666', flexShrink: 0 }}>涨幅:</span>
          <Selector
            options={changePctOptions}
            value={[minChangePct]}
            onChange={(v) => v?.length && setMinChangePct(v[0])}
            style={{
              '--border-radius': '4px',
              '--checked-color': '#1677ff',
              '--checked-text-color': '#fff',
              '--padding': '4px 8px',
              fontSize: 11,
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#666', flexShrink: 0 }}>市值:</span>
          <Selector
            options={marketCapOptions}
            value={[marketCapFilter]}
            onChange={(v) => v?.length && setMarketCapFilter(v[0])}
            style={{
              '--border-radius': '4px',
              '--checked-color': '#1677ff',
              '--checked-text-color': '#fff',
              '--padding': '4px 8px',
              fontSize: 11,
            }}
          />
          <Button
            color="primary"
            size="small"
            onClick={handleSearch}
            loading={loading}
            style={{ flexShrink: 0 }}
          >
            查询
          </Button>
        </div>
      </Card>

      {/* 行业分布 */}
      {industryStats.length > 0 && (
        <Card style={{ margin: '0 8px 8px', borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 'bold' }}>行业分布</span>
            {selectedIndustry && (
              <Tag
                color="danger"
                fill="outline"
                style={{ fontSize: 10 }}
                onClick={() => handleIndustryClick(selectedIndustry)}
              >
                {selectedIndustry} ✕
              </Tag>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {industryStats.slice(0, 15).map((item) => (
              <Tag
                key={item.name}
                color={selectedIndustry === item.name ? 'primary' : 'default'}
                fill={selectedIndustry === item.name ? 'solid' : 'outline'}
                style={{ fontSize: 10, padding: '2px 6px' }}
                onClick={() => handleIndustryClick(item.name)}
              >
                {item.name}: {item.count}
              </Tag>
            ))}
          </div>
        </Card>
      )}

      {/* 股票列表 - 平铺展示 */}
      <Card ref={listCardRef} style={{ margin: '0 8px 8px', borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold' }}>
              涨幅榜 {dateRange[0]?.format('MM-DD')}~{dateRange[1]?.format('MM-DD')}
            </div>
            <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
              涨幅≥{minChangePct}% {selectedIndustry && `· ${selectedIndustry}`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag color="primary" fill="outline" style={{ fontSize: 11 }}>
              共{totalRef.current}只
            </Tag>
            {stockData.length > 0 && (
              <MoreOutline 
                style={{ fontSize: 20, color: '#666' }} 
                onClick={() => setActionSheetVisible(true)} 
              />
            )}
          </div>
        </div>
        
        {loading && stockData.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
            <SpinLoading color="primary" />
          </div>
        ) : stockData.length > 0 ? (
          <div>
            {stockData.map((stock, idx) => (
              <StockItem
                key={stock.symbol}
                stock={stock}
                rank={idx + 1}
                onClick={() => handleStockClick(stock)}
              />
            ))}
          </div>
        ) : (
          <Empty description="暂无数据，请点击查询" style={{ padding: 60 }} />
        )}
        
        <InfiniteScroll loadMore={loadMore} hasMore={hasMore} threshold={100}>
          {hasMore ? <SpinLoading /> : null}
        </InfiniteScroll>
      </Card>

      {/* 操作菜单 */}
      <ActionSheet
        visible={actionSheetVisible}
        actions={actionSheetActions}
        onClose={() => setActionSheetVisible(false)}
        cancelText="取消"
      />
    </div>
  )
}
