import { useState, useCallback, useMemo, useRef } from 'react'
import { Card, DatePicker, Button, Table, Tag, message, InputNumber, Select, Grid, Space } from 'antd'
import { SearchOutlined, DownloadOutlined, CopyOutlined, CameraOutlined } from '@ant-design/icons'
import axios from 'axios'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import StockDetailDrawer from './StockDetailDrawer'

const { RangePicker } = DatePicker
const { useBreakpoint } = Grid

// 市场配置
const marketOptions = [
  { label: '港股', value: 'hk' },
  { label: 'A股', value: 'a' },
]

// 市场默认预设配置
const marketDefaultPresets = {
  hk: { label: '24.01-至今 AI浪潮', value: [dayjs('2024-01-02'), dayjs().subtract(1, 'day')] },
  a: { label: '24.09-至今 政策牛', value: [dayjs('2024-09-24'), dayjs().subtract(1, 'day')] },
}

// 获取日期预设（包含通用预设 + 市场特定牛市阶段预设）
const getDatePresets = (market) => {
  // 通用预设
  const commonPresets = [
    { label: '近1周', value: [dayjs().subtract(7, 'day'), dayjs().subtract(1, 'day')] },
    { label: '近2周', value: [dayjs().subtract(14, 'day'), dayjs().subtract(1, 'day')] },
    { label: '近1月', value: [dayjs().subtract(1, 'month'), dayjs().subtract(1, 'day')] },
    { label: '近半年', value: [dayjs().subtract(6, 'month'), dayjs().subtract(1, 'day')] },
    { label: '近1年', value: [dayjs().subtract(1, 'year'), dayjs().subtract(1, 'day')] },
    { label: '近2年', value: [dayjs().subtract(2, 'year'), dayjs().subtract(1, 'day')] },
  ]

  // 市场特定的牛市阶段预设
  const marketPresets = market === 'a' 
    ? [
        { label: '24.09-至今 政策牛', value: [dayjs('2024-09-24'), dayjs().subtract(1, 'day')] },
        { label: '19.01-21.02 核心资产牛', value: [dayjs('2019-01-04'), dayjs('2021-02-18')] },
        { label: '14.07-15.06 杠杆牛', value: [dayjs('2014-07-01'), dayjs('2015-06-12')] },
        { label: '05.06-07.10 股改牛', value: [dayjs('2005-06-06'), dayjs('2007-10-16')] },
      ]
    : [
        { label: '24.01-至今 AI浪潮', value: [dayjs('2024-01-02'), dayjs().subtract(1, 'day')] },
        { label: '16.02-18.01 南下资金', value: [dayjs('2016-02-01'), dayjs('2018-01-31')] },
        { label: '03.04-07.10 SARS后', value: [dayjs('2003-04-01'), dayjs('2007-10-31')] },
      ]

  return [...marketPresets, ...commonPresets]
}

/**
 * RangeStatsPanel - 区间涨幅查询面板
 * 包含：查询条件 + 行业分布 + 区间涨幅排行
 * 
 * @param {Object} props
 * @param {Array} props.dateRange - 日期范围 [dayjs, dayjs]
 * @param {Function} props.onDateRangeChange - 日期变化回调
 * @param {string} props.market - 市场 'hk' | 'a'
 * @param {Function} props.onMarketChange - 市场变化回调
 * @param {boolean} props.showDatePicker - 是否显示日期选择器（默认true）
 * @param {boolean} props.showMarketSelect - 是否显示市场选择（默认true）
 */
export default function RangeStatsPanel({
  dateRange: externalDateRange,
  onDateRangeChange,
  market: externalMarket,
  onMarketChange,
  showDatePicker = true,
  showMarketSelect = true,
}) {
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const tableCardRef = useRef(null)

  // 内部状态（如果外部没传则使用内部状态）
  const [internalDateRange, setInternalDateRange] = useState([dayjs('2024-01-02'), dayjs().subtract(1, 'day')])
  const [internalMarket, setInternalMarket] = useState('hk')
  
  // 实际使用的值
  const dateRange = externalDateRange || internalDateRange
  const market = externalMarket ?? internalMarket

  // 当前市场的日期预设（包含牛市阶段 + 通用预设）
  const datePresets = useMemo(() => getDatePresets(market), [market])

  // 查询条件状态
  const [minChangePct, setMinChangePct] = useState(60)
  const [marketCapMode, setMarketCapMode] = useState('range')
  const [marketCapValue, setMarketCapValue] = useState(null)
  const [minMarketCap, setMinMarketCap] = useState(20)
  const [maxMarketCap, setMaxMarketCap] = useState(1000)
  const [selectedIndustry, setSelectedIndustry] = useState('')

  // 数据状态
  const [tableLoading, setTableLoading] = useState(false)
  const [allStockData, setAllStockData] = useState([])
  const [industryStats, setIndustryStats] = useState([])

  // 抽屉状态
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [selectedStock, setSelectedStock] = useState(null)

  // 日期变化处理
  const handleDateRangeChange = (dates) => {
    if (dates?.[0] && dates?.[1]) {
      if (onDateRangeChange) {
        onDateRangeChange(dates)
      } else {
        setInternalDateRange(dates)
      }
    }
  }

  // 市场变化处理
  const handleMarketChange = (newMarket) => {
    if (onMarketChange) {
      onMarketChange(newMarket)
    } else {
      setInternalMarket(newMarket)
    }
    // 切换市场时使用该市场的默认预设
    const defaultPreset = marketDefaultPresets[newMarket]
    if (defaultPreset && onDateRangeChange) {
      onDateRangeChange(defaultPreset.value)
    } else if (defaultPreset) {
      setInternalDateRange(defaultPreset.value)
    }
    setAllStockData([])
    setIndustryStats([])
    setSelectedIndustry('')
  }

  // 获取区间涨幅股票数据
  const fetchStockData = useCallback(async (industry = '') => {
    if (!dateRange[0] || !dateRange[1]) return
    
    setTableLoading(true)
    try {
      let actualMinCap = 0, actualMaxCap = 0
      
      if (marketCapMode === 'less' && marketCapValue) actualMaxCap = marketCapValue
      else if (marketCapMode === 'greater' && marketCapValue) actualMinCap = marketCapValue
      else if (marketCapMode === 'range') {
        actualMinCap = minMarketCap || 0
        actualMaxCap = maxMarketCap || 0
      }
      
      const params = {
        start_date: dateRange[0].format('YYYYMMDD'),
        end_date: dateRange[1].format('YYYYMMDD'),
        min_change_pct: minChangePct,
        min_market_cap: actualMinCap,
        max_market_cap: actualMaxCap,
        market: market,
      }
      if (industry) params.industry = industry
      
      const response = await axios.get('/api/v1/stock/range', { params, timeout: 120000 })
      const result = response.data
      
      if (result.data) {
        setAllStockData(result.data)
        if (!industry) setIndustryStats(result.industryStats || [])
      }
    } catch (error) {
      console.error('获取股票数据失败:', error)
      message.error('获取股票数据失败')
    } finally {
      setTableLoading(false)
    }
  }, [dateRange, minChangePct, marketCapMode, marketCapValue, minMarketCap, maxMarketCap, market])

  // 打开股票详情
  const openStockDetail = useCallback((stock) => {
    setSelectedStock(stock)
    setDrawerVisible(true)
  }, [])

  // 关闭抽屉
  const closeDrawer = useCallback(() => {
    setDrawerVisible(false)
  }, [])

  const handleSearch = () => {
    setSelectedIndustry('')
    fetchStockData('')
  }

  const handleTableChange = (pag, filters, sorter) => {
    if (sorter.field && sorter.order) {
      const sorted = [...allStockData].sort((a, b) => {
        const aVal = a[sorter.field] || 0
        const bVal = b[sorter.field] || 0
        if (typeof aVal === 'string') {
          return sorter.order === 'ascend' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
        }
        return sorter.order === 'ascend' ? aVal - bVal : bVal - aVal
      })
      setAllStockData(sorted)
    }
  }

  const handleIndustryClick = (industry) => {
    if (selectedIndustry === industry) {
      setSelectedIndustry('')
      fetchStockData('')
    } else {
      setSelectedIndustry(industry)
      fetchStockData(industry)
    }
  }

  const handleMarketCapModeChange = (v) => {
    setMarketCapMode(v)
    if (v === 'range') {
      setMinMarketCap(20)
      setMaxMarketCap(500)
      setMarketCapValue(null)
    } else if (v === 'less') {
      setMarketCapValue(50)
      setMinMarketCap(null)
      setMaxMarketCap(null)
    } else if (v === 'greater') {
      setMarketCapValue(1000)
      setMinMarketCap(null)
      setMaxMarketCap(null)
    } else {
      setMarketCapValue(null)
      setMinMarketCap(null)
      setMaxMarketCap(null)
    }
  }

  // 生成查询条件标题
  const getQueryTitle = useCallback(() => {
    const parts = [`区间涨幅排行 ${dateRange[0]?.format('YYYY-MM-DD')} ~ ${dateRange[1]?.format('YYYY-MM-DD')}`]
    parts.push(`涨幅≥${minChangePct}%`)
    if (marketCapMode === 'range' && (minMarketCap || maxMarketCap)) {
      parts.push(`市值${minMarketCap || 0}~${maxMarketCap || '不限'}亿`)
    } else if (marketCapMode === 'greater' && marketCapValue) {
      parts.push(`市值>${marketCapValue}亿`)
    } else if (marketCapMode === 'less' && marketCapValue) {
      parts.push(`市值<${marketCapValue}亿`)
    }
    if (selectedIndustry) parts.push(`行业:${selectedIndustry}`)
    return parts.join(' | ')
  }, [dateRange, minChangePct, marketCapMode, marketCapValue, minMarketCap, maxMarketCap, selectedIndustry])

  // 导出 Excel
  const handleExportExcel = useCallback(() => {
    if (!allStockData.length) {
      message.warning('没有数据可导出')
      return
    }

    const title = getQueryTitle()
    const exportData = allStockData.map((item, index) => ({
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
    message.success('导出成功')
  }, [allStockData, dateRange, getQueryTitle])

  // 复制到剪贴板
  const handleCopy = useCallback(async () => {
    if (!allStockData.length) {
      message.warning('没有数据可复制')
      return
    }

    const title = getQueryTitle()
    const header = ['排名', '代码', '名称', '起始价', '结束价', '涨幅(%)', '现价', '市值(亿)', '市盈率', '市净率', '换手率(%)'].join('\t')
    const rows = allStockData.map((item, index) => [
      index + 1,
      item.symbol,
      item.name,
      item.startPrice?.toFixed(3),
      item.endPrice?.toFixed(3),
      item.changePct?.toFixed(2),
      item.latestPrice?.toFixed(2),
      item.totalMarketCap ? (item.totalMarketCap / 100000000).toFixed(2) : '-',
      item.peRatio?.toFixed(2) || '-',
      item.pbRatio?.toFixed(2) || '-',
      item.turnoverRate?.toFixed(2) || '-',
    ].join('\t'))

    const text = [title, '', header, ...rows].join('\n')
    
    try {
      await navigator.clipboard.writeText(text)
      message.success(`已复制 ${allStockData.length} 条数据`)
    } catch {
      message.error('复制失败，请手动复制')
    }
  }, [allStockData, getQueryTitle])

  // 截图功能
  const handleScreenshot = useCallback(async () => {
    if (!tableCardRef.current || !allStockData.length) {
      message.warning('没有数据可截图')
      return
    }

    const hide = message.loading('正在生成截图...', 0)
    
    try {
      const canvas = await html2canvas(tableCardRef.current, {
        backgroundColor: '#fff',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      
      const link = document.createElement('a')
      link.download = `区间涨幅_${dateRange[0]?.format('YYYYMMDD')}_${dateRange[1]?.format('YYYYMMDD')}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      
      hide()
      message.success('截图已保存')
    } catch (error) {
      hide()
      console.error('截图失败:', error)
      message.error('截图失败')
    }
  }, [allStockData, dateRange])

  // 表格列定义
  const columns = useMemo(() => [
    {
      title: '#',
      dataIndex: 'rank',
      width: isMobile ? 36 : 60,
      fixed: 'left',
      render: (_, __, index) => {
        const rank = index + 1
        const color = rank <= 3 ? 'red' : rank <= 10 ? 'orange' : 'default'
        return <Tag color={color} style={{ margin: 0, fontSize: isMobile ? 10 : 12 }}>{rank}</Tag>
      },
    },
    { title: '代码', dataIndex: 'symbol', width: 70, responsive: ['md'], sorter: (a, b) => a.symbol.localeCompare(b.symbol) },
    {
      title: '名称',
      dataIndex: 'name',
      width: isMobile ? 60 : 100,
      fixed: 'left',
      ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (text, record) => (
        <a onClick={() => openStockDetail(record)} style={{ color: '#1677ff', fontSize: isMobile ? 12 : 14 }}>{text}</a>
      ),
    },
    { title: '起始价', dataIndex: 'startPrice', width: 80, align: 'right', responsive: ['lg'], sorter: (a, b) => (a.startPrice || 0) - (b.startPrice || 0), render: (v) => v?.toFixed(3) },
    { title: '结束价', dataIndex: 'endPrice', width: 80, align: 'right', responsive: ['lg'], sorter: (a, b) => (a.endPrice || 0) - (b.endPrice || 0), render: (v) => v?.toFixed(3) },
    {
      title: '涨幅',
      dataIndex: 'changePct',
      width: isMobile ? 60 : 90,
      align: 'right',
      sorter: (a, b) => (a.changePct || 0) - (b.changePct || 0),
      defaultSortOrder: 'descend',
      render: (v) => <span style={{ color: v >= 0 ? '#ec5a5a' : '#47b262', fontWeight: 'bold', fontSize: isMobile ? 12 : 14 }}>{v >= 0 ? '+' : ''}{v?.toFixed(1)}%</span>,
    },
    { title: '现价', dataIndex: 'latestPrice', width: isMobile ? 50 : 70, align: 'right', sorter: (a, b) => (a.latestPrice || 0) - (b.latestPrice || 0), render: (v) => <span style={{ fontSize: isMobile ? 11 : 14 }}>{v?.toFixed(2)}</span> },
    { title: '市值', dataIndex: 'totalMarketCap', width: isMobile ? 50 : 80, align: 'right', sorter: (a, b) => (a.totalMarketCap || 0) - (b.totalMarketCap || 0), render: (v) => <span style={{ fontSize: isMobile ? 11 : 14 }}>{v ? (v / 100000000).toFixed(0) : '-'}</span> },
    { title: '市盈率', dataIndex: 'peRatio', width: 70, align: 'right', responsive: ['lg'], sorter: (a, b) => (a.peRatio || 0) - (b.peRatio || 0), render: (v) => v ? v.toFixed(2) : '-' },
    { title: '市净率', dataIndex: 'pbRatio', width: 70, align: 'right', responsive: ['xl'], sorter: (a, b) => (a.pbRatio || 0) - (b.pbRatio || 0), render: (v) => v ? v.toFixed(2) : '-' },
    { title: '换手率', dataIndex: 'turnoverRate', width: 70, align: 'right', responsive: ['xl'], sorter: (a, b) => (a.turnoverRate || 0) - (b.turnoverRate || 0), render: (v) => v ? v.toFixed(2) + '%' : '-' },
  ], [isMobile, openStockDetail])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 4 : 12 }}>
      {/* 查询条件区 - 一排布局 */}
      <Card size="small" styles={{ body: { padding: isMobile ? 8 : '8px 12px' } }}>
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {showDatePicker && (
              <RangePicker value={dateRange} onChange={handleDateRangeChange} allowClear={false} size="small" style={{ width: '100%' }} presets={datePresets} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                <span style={{ fontSize: 12, color: '#666', flexShrink: 0 }}>涨幅≥</span>
                <InputNumber value={minChangePct} onChange={setMinChangePct} min={0} max={1000} suffix="%" size="small" style={{ flex: 1, minWidth: 60 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                <span style={{ fontSize: 12, color: '#666', flexShrink: 0 }}>市值</span>
                <Select value={marketCapMode} onChange={handleMarketCapModeChange} size="small" style={{ flex: 1, minWidth: 60 }} options={[{ label: '区间', value: 'range' }, { label: '大于', value: 'greater' }, { label: '小于', value: 'less' }, { label: '不限', value: 'none' }]} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {marketCapMode === 'range' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                  <InputNumber value={minMarketCap} onChange={setMinMarketCap} min={0} size="small" style={{ flex: 1 }} placeholder="最小" suffix="亿" />
                  <span style={{ fontSize: 12, color: '#999' }}>~</span>
                  <InputNumber value={maxMarketCap} onChange={setMaxMarketCap} min={0} size="small" style={{ flex: 1 }} placeholder="最大" suffix="亿" />
                </div>
              )}
              {(marketCapMode === 'less' || marketCapMode === 'greater') && (
                <InputNumber value={marketCapValue} onChange={setMarketCapValue} min={0} size="small" style={{ flex: 1 }} placeholder={marketCapMode === 'less' ? '小于' : '大于'} suffix="亿" />
              )}
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={tableLoading} size="small" style={{ flexShrink: 0 }}>查询</Button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {showMarketSelect && (
              <Select value={market} onChange={handleMarketChange} style={{ width: 80 }} options={marketOptions} />
            )}
            {showDatePicker && (
              <RangePicker value={dateRange} onChange={handleDateRangeChange} allowClear={false} size="middle" style={{ width: 260 }} presets={datePresets} />
            )}
            {!showDatePicker && dateRange[0] && dateRange[1] && (
              <span style={{ fontSize: 13, color: '#666', padding: '0 8px', background: '#f5f5f5', borderRadius: 4, lineHeight: '30px' }}>
                {dateRange[0].format('YYYY-MM-DD')} ~ {dateRange[1].format('YYYY-MM-DD')}
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13, color: '#666' }}>涨幅≥</span>
              <InputNumber value={minChangePct} onChange={setMinChangePct} min={0} max={1000} suffix="%" size="middle" style={{ width: 80 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13, color: '#666' }}>市值</span>
              <Select value={marketCapMode} onChange={handleMarketCapModeChange} style={{ width: 72 }} options={[{ label: '区间', value: 'range' }, { label: '大于', value: 'greater' }, { label: '小于', value: 'less' }, { label: '不限', value: 'none' }]} />
              {marketCapMode === 'range' && (
                <>
                  <InputNumber value={minMarketCap} onChange={setMinMarketCap} min={0} placeholder="最小" style={{ width: 100 }} addonAfter="亿" />
                  <span style={{ color: '#999' }}>~</span>
                  <InputNumber value={maxMarketCap} onChange={setMaxMarketCap} min={0} placeholder="最大" style={{ width: 100 }} addonAfter="亿" />
                </>
              )}
              {(marketCapMode === 'less' || marketCapMode === 'greater') && (
                <InputNumber value={marketCapValue} onChange={setMarketCapValue} min={0} style={{ width: 90 }} addonAfter="亿" />
              )}
            </div>
            <div style={{ flex: 1 }} />
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={tableLoading}>查询</Button>
          </div>
        )}
      </Card>

      {/* 行业统计 */}
      {industryStats.length > 0 && (
        <Card 
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: isMobile ? 12 : 14 }}>行业分布</span>
              {selectedIndustry && (
                <Tag color="red" closable onClose={() => handleIndustryClick(selectedIndustry)} style={{ fontSize: 11, margin: 0 }}>{selectedIndustry}</Tag>
              )}
            </div>
          } 
          size="small"
          styles={{ body: { padding: isMobile ? 6 : 12 } }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 3 : 8 }}>
            {industryStats.map((item) => (
              <Tag key={item.name} color={selectedIndustry === item.name ? 'red' : 'blue'} style={{ margin: 0, cursor: 'pointer', fontSize: isMobile ? 10 : 12, padding: isMobile ? '0 4px' : undefined }} onClick={() => handleIndustryClick(item.name)}>
                {item.name}: {item.count}
              </Tag>
            ))}
          </div>
        </Card>
      )}

      {/* 股票表格区域 */}
      <Card
        ref={tableCardRef}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: isMobile ? 12 : 14 }}>
                {isMobile ? `涨幅榜 ${dateRange[0]?.format('MM-DD')}~${dateRange[1]?.format('MM-DD')}` : getQueryTitle()}
              </span>
              {allStockData.length > 0 && <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>共{allStockData.length}只</Tag>}
            </div>
            {!isMobile && allStockData.length > 0 && (
              <Space size="small">
                <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>复制</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={handleExportExcel}>导出Excel</Button>
                <Button size="small" icon={<CameraOutlined />} onClick={handleScreenshot}>截图</Button>
              </Space>
            )}
          </div>
        }
        size="small"
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        styles={{ body: { flex: 1, overflow: 'auto', padding: 0 } }}
      >
        <Table
          columns={columns}
          dataSource={allStockData}
          rowKey="symbol"
          loading={tableLoading}
          pagination={false}
          onChange={handleTableChange}
          size="small"
          scroll={{ x: isMobile ? 280 : 800, y: 'calc(100vh - 450px)' }}
          sticky
        />
      </Card>

      {/* 股票详情抽屉 */}
      <StockDetailDrawer visible={drawerVisible} stock={selectedStock} onClose={closeDrawer} market={market} />
    </div>
  )
}
