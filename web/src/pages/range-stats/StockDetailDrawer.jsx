import { memo } from 'react'
import { Drawer } from 'antd'
import StockDetail from './StockDetail'

function StockDetailDrawer({ visible, stock, onClose }) {
  return (
    <Drawer
      title={stock ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 'bold' }}>{stock.name}</span>
          <span style={{ color: '#999', fontSize: 12 }}>{stock.symbol}</span>
          <span style={{ color: stock.changePct >= 0 ? '#ec5a5a' : '#47b262', fontWeight: 'bold', fontSize: 14 }}>
            {stock.latestPrice?.toFixed(2)} {stock.changePct >= 0 ? '+' : ''}{stock.changePct?.toFixed(2)}%
          </span>
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
