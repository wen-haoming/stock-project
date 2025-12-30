/**
 * 涨幅榜组件 - 大盘行情页面使用
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Card, Tag, Spin, Button, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { ListTable } from '@visactor/react-vtable'
import axios from 'axios'
import { useTheme, getVTableTheme } from '../../../contexts/ThemeContext'
import { StockTableToolbar, exportColumnPresets } from '../../../components/StockTable'

// 颜色配置
const upColor = '#ec5a5a'
const downColor = '#47b262'

export default function TopGainersTable({ market = 'a', title = '涨幅榜', height = 400, onStockClick }) {
  const { vtableTheme, isDark } = useTheme()
  const vtableRef = useRef(null)
  const containerRef = useRef(null)
  const stockDataRef = useRef([])
  
  const [loading, setLoading] = useState(false)
  const [stockData, setStockData] = useState([])

  // 获取涨幅榜数据
  const fetchTopGainers = useCallback(async () => {
    setLoading(true)
    try {
      // 使用东方财富接口获取涨幅榜
      const marketCode = market === 'a' ? 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23' : 'm:128+t:3,m:128+t:4,m:128+t:1,m:128+t:2'
      const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=${marketCode}&fields=f2,f3,f4,f5,f6,f7,f12,f14,f15,f16,f17,f18,f20,f21`
      
      const response = await axios.get(url)
      const list = response.data?.data?.diff || []
      
      const data = list.map(item => ({
        symbol: item.f12,
        name: item.f14,
        latestPrice: item.f2,
        changePct: item.f3,
        changeAmt: item.f4,
        volume: item.f5,
        amount: item.f6,
        amplitude: item.f7,
        high: item.f15,
        low: item.f16,
        open: item.f17,
        preClose: item.f18,
        totalMarketCap: item.f20,
        floatMarketCap: item.f21,
      })).filter(item => item.latestPrice && item.latestPrice !== '-')
      
      setStockData(data)
      stockDataRef.current = data
    } catch (error) {
      console.error('获取涨幅榜失败:', error)
      message.error('获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [market])

  // 初始加载
  useEffect(() => {
    fetchTopGainers()
  }, [fetchTopGainers])

  // VTable 列配置
  const columns = useMemo(() => [
    { field: 'rank', title: '#', width: 40, sort: false },
    { field: 'symbol', title: '代码', width: 70, sort: true },
    { 
      field: 'name', 
      title: '名称', 
      width: 85, 
      sort: true,
      style: { color: '#1677ff', cursor: 'pointer' }
    },
    { 
      field: 'latestPrice', 
      title: '现价', 
      width: 65, 
      sort: true,
      fieldFormat: (record) => record.latestPrice?.toFixed(2) || '-',
    },
    { 
      field: 'changePct', 
      title: '涨跌幅', 
      width: 75, 
      sort: true,
      fieldFormat: (record) => record.changePct != null ? `${record.changePct >= 0 ? '+' : ''}${record.changePct.toFixed(2)}%` : '-',
      style: (args) => {
        const record = args.table?.getCellOriginRecord(args.col, args.row)
        if (!record) return {}
        return { color: record.changePct >= 0 ? upColor : downColor }
      }
    },
    { 
      field: 'amount', 
      title: '成交额', 
      width: 75, 
      sort: true,
      fieldFormat: (record) => record.amount ? `${(record.amount / 100000000).toFixed(1)}亿` : '-',
    },
  ], [])

  // 表格数据（添加排名）
  const tableRecords = useMemo(() => {
    return stockData.map((item, index) => ({
      ...item,
      rank: index + 1,
    }))
  }, [stockData])

  // VTable 主题配置
  const baseVTableTheme = useMemo(() => 
    getVTableTheme(vtableTheme, { rowHeight: 32, headerRowHeight: 32, fontSize: 13 }), 
    [vtableTheme]
  )

  // VTable 配置
  const vtableOption = useMemo(() => ({
    columns,
    records: tableRecords,
    ...baseVTableTheme,
    widthMode: 'adaptive',
    autoWrapText: false,
    hover: { highlightMode: 'row' },
  }), [columns, tableRecords, baseVTableTheme])

  // 处理点击
  const handleTableClick = useCallback((args) => {
    const { col, row, field } = args
    if (row === 0) return
    
    const record = vtableRef.current?.getRecordByRowCol(col, row)
    if (!record) return
    
    if (field === 'name' && onStockClick) {
      const originalData = stockDataRef.current.find(item => item.symbol === record.symbol)
      if (originalData) {
        onStockClick(originalData)
      }
    }
  }, [onStockClick])

  // VTable 就绪回调
  const handleVTableReady = useCallback((instance) => {
    vtableRef.current = instance
    instance.on('click_cell', handleTableClick)
  }, [handleTableClick])

  // 更新表格数据
  useEffect(() => {
    if (vtableRef.current && tableRecords.length > 0) {
      vtableRef.current.setRecords(tableRecords)
    }
  }, [tableRecords])

  // 导出列配置
  const exportColumns = useMemo(() => exportColumnPresets.marketOverview, [])

  return (
    <Card
      ref={containerRef}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>{title}</span>
            {stockData.length > 0 && (
              <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{stockData.length}只</Tag>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StockTableToolbar
              data={stockData}
              columns={exportColumns}
              title={title}
              fileName={`${title}_${market}`}
              sheetName={title}
              containerRef={containerRef}
              isDark={isDark}
            />
            <Button 
              type="text" 
              size="small" 
              icon={<ReloadOutlined />} 
              onClick={fetchTopGainers}
              loading={loading}
            />
          </div>
        </div>
      }
      size="small"
      styles={{ body: { padding: 0 } }}
    >
      <Spin spinning={loading}>
        {stockData.length > 0 ? (
          <ListTable
            option={vtableOption}
            onReady={handleVTableReady}
            height={height}
          />
        ) : !loading ? (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
            暂无数据
          </div>
        ) : (
          <div style={{ height: 200 }} />
        )}
      </Spin>
    </Card>
  )
}
