import { memo } from 'react'
import { Drawer, Space, Tooltip } from 'antd'
import StockDetail from './StockDetail'

// 生成东财链接（港股）
const getEastMoneyUrl = (symbol) => {
  // symbol 格式如 00700, 需要转为 116.00700
  const code = symbol?.replace(/^0+/, '') || symbol
  return `https://quote.eastmoney.com/hk/${symbol}.html`
}

// 生成雪球链接（港股）
const getXueqiuUrl = (symbol) => {
  // 雪球港股格式为 0xxxx
  return `https://xueqiu.com/S/${symbol}`
}

function StockDetailDrawer({ visible, stock, onClose }) {
  return (
    <Drawer
      title={stock ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 'bold' }}>{stock.name}</span>
          <span style={{ color: '#999', fontSize: 12 }}>{stock.symbol}</span>
          <span style={{ color: stock.changePct >= 0 ? '#ec5a5a' : '#47b262', fontWeight: 'bold', fontSize: 14 }}>
            {stock.latestPrice?.toFixed(2)} {stock.changePct >= 0 ? '+' : ''}{stock.changePct?.toFixed(2)}%
          </span>
          <Space size={4} style={{ marginLeft: 8 }}>
            <Tooltip title="在东方财富查看">
              <a 
                href={getEastMoneyUrl(stock.symbol)} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ fontSize: 12, padding: '2px 6px', background: '#f5f5f5', borderRadius: 4 }}
              >
                东财
              </a>
            </Tooltip>
            <Tooltip title="在雪球查看">
              <a 
                href={getXueqiuUrl(stock.symbol)} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ fontSize: 12, padding: '2px 6px', background: '#f5f5f5', borderRadius: 4 }}
              >
                雪球
              </a>
            </Tooltip>
          </Space>
        </div>
      ) : '股票详情'}
      placement="right"
      width={800}
      onClose={onClose}
      open={visible}
      destroyOnClose
      styles={{ body: { padding: 0, overflow: 'auto' } }}
    >
      <StockDetail stock={stock} />
    </Drawer>
  )
}

export default memo(StockDetailDrawer)
