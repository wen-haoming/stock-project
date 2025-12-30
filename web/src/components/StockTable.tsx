/**
 * 通用股票列表工具组件
 * 提供：复制、导出Excel、截图功能
 */
import { useCallback } from 'react'
import { Button, Space, message } from 'antd'
import { DownloadOutlined, CopyOutlined, CameraOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'

/**
 * 股票表格工具栏组件
 * @param {Object} props
 * @param {Array} props.data - 股票数据
 * @param {Array} props.columns - 列配置 [{field, title, format}]
 * @param {string} props.title - 导出标题
 * @param {string} props.fileName - 导出文件名
 * @param {string} props.sheetName - Excel sheet名称
 * @param {React.RefObject} props.containerRef - 截图容器ref
 * @param {boolean} props.showCopy - 是否显示复制按钮
 * @param {boolean} props.showExport - 是否显示导出按钮
 * @param {boolean} props.showScreenshot - 是否显示截图按钮
 * @param {boolean} props.isDark - 是否暗色主题
 */
export const StockTableToolbar = ({
  data = [],
  columns = [],
  title = '',
  fileName = '股票数据',
  sheetName = '数据',
  containerRef,
  showCopy = true,
  showExport = true,
  showScreenshot = true,
  isDark = false,
}) => {
  // 复制功能
  const handleCopy = useCallback(async () => {
    if (!data.length) {
      message.warning('没有数据可复制')
      return
    }

    const headers = columns.map(c => c.title)
    const header = headers.join('\t')
    
    const rows = data.map((item, index) => {
      return columns.map(col => {
        if (col.format) {
          return col.format(item, index)
        }
        return item[col.field] ?? '-'
      }).join('\t')
    })

    const text = title ? [title, '', header, ...rows].join('\n') : [header, ...rows].join('\n')
    
    try {
      await navigator.clipboard.writeText(text)
      message.success(`已复制 ${data.length} 条数据`)
    } catch {
      message.error('复制失败')
    }
  }, [data, columns, title])

  // 导出 Excel
  const handleExportExcel = useCallback(() => {
    if (!data.length) {
      message.warning('没有数据可导出')
      return
    }

    const exportData = data.map((item, index) => {
      const row = {}
      columns.forEach(col => {
        if (col.format) {
          row[col.title] = col.format(item, index)
        } else {
          row[col.title] = item[col.field] ?? '-'
        }
      })
      return row
    })

    const ws = XLSX.utils.json_to_sheet([])
    if (title) {
      XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: 'A1' })
      XLSX.utils.sheet_add_aoa(ws, [[]], { origin: 'A2' })
      XLSX.utils.sheet_add_json(ws, exportData, { origin: 'A3' })
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } }]
    } else {
      XLSX.utils.sheet_add_json(ws, exportData, { origin: 'A1' })
    }
    
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    
    XLSX.writeFile(wb, `${fileName}.xlsx`)
    message.success('导出成功')
  }, [data, columns, title, fileName, sheetName])

  // 截图功能
  const handleScreenshot = useCallback(async () => {
    if (!containerRef?.current || !data.length) {
      message.warning('没有数据可截图')
      return
    }

    const hide = message.loading('正在生成截图...', 0)
    
    try {
      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: isDark ? '#1f1f1f' : '#fff',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      
      const link = document.createElement('a')
      link.download = `${fileName}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      
      hide()
      message.success('截图已保存')
    } catch (error) {
      hide()
      console.error('截图失败:', error)
      message.error('截图失败')
    }
  }, [data, containerRef, fileName, isDark])

  if (!data.length) return null

  return (
    <Space size="small">
      {showCopy && <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>复制</Button>}
      {showExport && <Button size="small" icon={<DownloadOutlined />} onClick={handleExportExcel}>导出Excel</Button>}
      {showScreenshot && <Button size="small" icon={<CameraOutlined />} onClick={handleScreenshot}>截图</Button>}
    </Space>
  )
}

/**
 * 预定义的列格式化函数
 */
export const columnFormatters = {
  rank: (item, index) => index + 1,
  symbol: (item) => item.symbol,
  name: (item) => item.name,
  price: (item) => item.price?.toFixed(2) || item.latestPrice?.toFixed(2) || '-',
  latestPrice: (item) => item.latestPrice?.toFixed(2) || '-',
  startPrice: (item) => item.startPrice?.toFixed(3) || '-',
  endPrice: (item) => item.endPrice?.toFixed(3) || '-',
  changePct: (item) => item.changePct != null ? `${item.changePct >= 0 ? '+' : ''}${item.changePct.toFixed(2)}%` : '-',
  changePctNoSign: (item) => item.changePct != null ? `${item.changePct.toFixed(2)}%` : '-',
  marketCap: (item) => item.totalMarketCap ? `${(item.totalMarketCap / 100000000).toFixed(0)}亿` : '-',
  marketCapNum: (item) => item.totalMarketCap ? (item.totalMarketCap / 100000000).toFixed(2) : '-',
  amount: (item) => item.amount ? `${(item.amount / 100000000).toFixed(2)}亿` : '-',
  turnoverRate: (item) => item.turnoverRate ? `${item.turnoverRate.toFixed(2)}%` : '-',
  peRatio: (item) => item.peRatio?.toFixed(2) || '-',
  pbRatio: (item) => item.pbRatio?.toFixed(2) || '-',
  amplitude: (item) => item.amplitude ? `${item.amplitude.toFixed(2)}%` : '-',
  high: (item) => item.high?.toFixed(2) || '-',
  low: (item) => item.low?.toFixed(2) || '-',
  open: (item) => item.open?.toFixed(2) || '-',
  preClose: (item) => item.preClose?.toFixed(2) || '-',
}

/**
 * 预定义的导出列配置
 */
export const exportColumnPresets = {
  // 区间统计
  rangeStats: [
    { field: 'rank', title: '排名', format: columnFormatters.rank },
    { field: 'symbol', title: '代码' },
    { field: 'name', title: '名称' },
    { field: 'startPrice', title: '起始价', format: columnFormatters.startPrice },
    { field: 'endPrice', title: '结束价', format: columnFormatters.endPrice },
    { field: 'changePct', title: '涨幅(%)', format: (item) => item.changePct?.toFixed(2) || '-' },
    { field: 'latestPrice', title: '现价', format: columnFormatters.latestPrice },
    { field: 'totalMarketCap', title: '市值(亿)', format: columnFormatters.marketCapNum },
    { field: 'peRatio', title: '市盈率', format: columnFormatters.peRatio },
    { field: 'pbRatio', title: '市净率', format: columnFormatters.pbRatio },
    { field: 'turnoverRate', title: '换手率(%)', format: (item) => item.turnoverRate?.toFixed(2) || '-' },
  ],
  // 大盘行情涨幅榜
  marketOverview: [
    { field: 'rank', title: '#', format: columnFormatters.rank },
    { field: 'symbol', title: '代码' },
    { field: 'name', title: '名称' },
    { field: 'latestPrice', title: '现价', format: columnFormatters.latestPrice },
    { field: 'changePct', title: '涨跌幅', format: columnFormatters.changePct },
    { field: 'amount', title: '成交额', format: columnFormatters.amount },
  ],
  // 自选股
  watchlist: [
    { field: 'rank', title: '#', format: columnFormatters.rank },
    { field: 'symbol', title: '代码' },
    { field: 'name', title: '名称' },
    { field: 'price', title: '现价', format: columnFormatters.price },
    { field: 'changePct', title: '涨跌幅', format: columnFormatters.changePct },
    { field: 'totalMarketCap', title: '市值', format: columnFormatters.marketCap },
    { field: 'amount', title: '成交额', format: columnFormatters.amount },
    { field: 'turnoverRate', title: '换手率', format: columnFormatters.turnoverRate },
    { field: 'peRatio', title: 'PE', format: columnFormatters.peRatio },
    { field: 'pbRatio', title: 'PB', format: columnFormatters.pbRatio },
    { field: 'amplitude', title: '振幅', format: columnFormatters.amplitude },
    { field: 'high', title: '最高', format: columnFormatters.high },
    { field: 'low', title: '最低', format: columnFormatters.low },
    { field: 'open', title: '今开', format: columnFormatters.open },
    { field: 'preClose', title: '昨收', format: columnFormatters.preClose },
  ],
}

export default StockTableToolbar
