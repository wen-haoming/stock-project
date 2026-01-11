import { memo } from 'react'
import { Drawer, Space, Tooltip } from 'antd'
import StockDetail from './StockDetail'
import { useTheme } from '../../contexts/ThemeContext'

// 生成东财链接
const getEastMoneyUrl = (symbol, market = 'hk') => {
  if (market === 'a') {
    const prefix = symbol.startsWith('6') ? 'sh' : 'sz'
    return `https://quote.eastmoney.com/${prefix}${symbol}.html`
  }
  if (market === 'us') {
    return `https://quote.eastmoney.com/us/${symbol}.html`
  }
  return `https://quote.eastmoney.com/hk/${symbol}.html`
}

// 生成雪球链接
const getXueqiuUrl = (symbol, market = 'hk') => {
  if (market === 'a') {
    const prefix = symbol.startsWith('6') ? 'SH' : 'SZ'
    return `https://xueqiu.com/S/${prefix}${symbol}`
  }
  if (market === 'us') {
    return `https://xueqiu.com/S/${symbol}`
  }
  return `https://xueqiu.com/S/${symbol}`
}

function StockDetailDrawer({ visible, stock, onClose, market = 'hk', dateRange }) {
  const { theme: currentTheme, isDark } = useTheme()
  
  return (
    <Drawer
      title={stock ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 'bold', fontSize: 16, color: currentTheme.custom.textColor }}>{stock.name}</span>
          <span style={{ color: currentTheme.custom.textColorSecondary, fontSize: 13 }}>{stock.symbol}</span>
          <span style={{ color: stock.changePct >= 0 ? '#ec5a5a' : '#47b262', fontWeight: 'bold', fontSize: 15 }}>
            {stock.latestPrice?.toFixed(2)} {stock.changePct >= 0 ? '+' : ''}{stock.changePct?.toFixed(2)}%
          </span>
          <Space size={4} style={{ marginLeft: 8 }}>
            <Tooltip title="在东方财富查看">
              <a href={getEastMoneyUrl(stock.symbol, market)} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, padding: '2px 8px', background: isDark ? '#3a3a3a' : '#f5f5f5', color: currentTheme.custom.textColor, borderRadius: 4 }}>东财</a>
            </Tooltip>
            <Tooltip title="在雪球查看">
              <a href={getXueqiuUrl(stock.symbol, market)} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, padding: '2px 8px', background: isDark ? '#3a3a3a' : '#f5f5f5', color: currentTheme.custom.textColor, borderRadius: 4 }}>雪球</a>
            </Tooltip>
          </Space>
        </div>
      ) : '股票详情'}
      placement="right"
      width="60vw"
      onClose={onClose}
      open={visible}
      styles={{ 
        body: { padding: 0, overflow: 'auto', background: currentTheme.custom.bgColorSecondary },
        header: { background: currentTheme.custom.bgColor, borderBottom: `1px solid ${currentTheme.custom.borderColor}` },
        content: { background: currentTheme.custom.bgColor }
      }}
    >
      {visible && <StockDetail stock={stock} market={market} dateRange={dateRange} />}
    </Drawer>
  )
}

export default memo(StockDetailDrawer)
