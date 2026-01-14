import { memo, useMemo, useState, useCallback } from 'react'
import { Spin, Empty, Tooltip } from 'antd'
import { useRequest } from 'ahooks'
import axios from 'axios'

// 涨跌颜色映射 - 更丰富的层次
const getColor = (changePct: number): string => {
  if (changePct >= 9.5) return '#8b0000'
  if (changePct >= 7) return '#a52a2a'
  if (changePct >= 5) return '#cd5c5c'
  if (changePct >= 3) return '#dc143c'
  if (changePct >= 1) return '#e57373'
  if (changePct >= 0.3) return '#ef9a9a'
  if (changePct > 0) return '#ffcdd2'
  if (changePct === 0) return '#424242'
  if (changePct > -0.3) return '#c8e6c9'
  if (changePct > -1) return '#a5d6a7'
  if (changePct > -3) return '#81c784'
  if (changePct > -5) return '#66bb6a'
  if (changePct > -7) return '#4caf50'
  if (changePct > -9.5) return '#388e3c'
  return '#1b5e20'
}

interface StockItem {
  symbol: string
  name: string
  changePct: number
  latestPrice: number
  marketCap?: number
  volume?: number
}

interface SectorItem {
  code: string
  name: string
  changePct: number
  marketCap: number
  stocks: StockItem[]
}

interface StockHeatmapProps {
  market: 'a' | 'hk' | 'us'
  height?: number
  onStockClick?: (stock: StockItem) => void
}

interface LayoutRect {
  x: number
  y: number
  w: number
  h: number
}

// Treemap squarify算法
function squarify(weights: number[], width: number, height: number): LayoutRect[] {
  if (weights.length === 0) return []
  if (weights.length === 1) return [{ x: 0, y: 0, w: width, h: height }]

  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  if (totalWeight <= 0) return weights.map(() => ({ x: 0, y: 0, w: 0, h: 0 }))

  const result: LayoutRect[] = new Array(weights.length)
  let currentX = 0
  let currentY = 0
  let remainingW = width
  let remainingH = height

  let start = 0
  let remaining = totalWeight

  while (start < weights.length) {
    const vertical = remainingW < remainingH
    const side = vertical ? remainingW : remainingH

    let bestEnd = start + 1
    let bestRatio = Infinity
    let rowWeight = weights[start]

    for (let end = start + 1; end <= weights.length; end++) {
      const rowSize = (rowWeight / remaining) * (vertical ? remainingH : remainingW)
      let worst = 0
      for (let i = start; i < end; i++) {
        const itemSize = (weights[i] / rowWeight) * side
        if (itemSize > 0 && rowSize > 0) {
          const ratio = Math.max(rowSize / itemSize, itemSize / rowSize)
          worst = Math.max(worst, ratio)
        }
      }

      if (worst <= bestRatio) {
        bestRatio = worst
        bestEnd = end
      } else {
        break
      }

      if (end < weights.length) {
        rowWeight += weights[end]
      }
    }

    rowWeight = 0
    for (let i = start; i < bestEnd; i++) rowWeight += weights[i]

    const rowSize = (rowWeight / remaining) * (vertical ? remainingH : remainingW)
    let offset = 0

    for (let i = start; i < bestEnd; i++) {
      const itemSize = (weights[i] / rowWeight) * side
      if (vertical) {
        result[i] = { x: currentX, y: currentY + offset, w: rowSize, h: itemSize }
      } else {
        result[i] = { x: currentX + offset, y: currentY, w: itemSize, h: rowSize }
      }
      offset += itemSize
    }

    if (vertical) {
      currentX += rowSize
      remainingW -= rowSize
    } else {
      currentY += rowSize
      remainingH -= rowSize
    }
    remaining -= rowWeight
    start = bestEnd
  }

  return result
}

const StockHeatmap = memo(({ market, height = 600, onStockClick }: StockHeatmapProps) => {
  const [hoveredStock, setHoveredStock] = useState<string | null>(null)

  // 获取热力图数据
  const { data, loading, error } = useRequest(
    async () => {
      const res = await axios.get('/api/v1/market/heatmap', {
        params: { market, limit: 60 }, // 获取更多板块
      })
      return (res.data?.data || []) as SectorItem[]
    },
    {
      refreshDeps: [market],
      pollingInterval: 60000,
    }
  )

  // 计算板块和股票布局
  const layoutData = useMemo(() => {
    if (!data || data.length === 0) return []

    // 计算板块权重 - 基于市值
    const sectorWeights = data.map((s) => {
      const cap = s.marketCap || 1e10
      return Math.sqrt(cap / 1e8) // 使用平方根让差异不那么悬殊
    })
    const sectorRects = squarify(sectorWeights, 100, 100)

    return data.map((sector, i) => {
      const sRect = sectorRects[i]

      // 股票布局
      let stockLayouts: { stock: StockItem; rect: LayoutRect }[] = []
      if (sector.stocks && sector.stocks.length > 0) {
        const stockWeights = sector.stocks.map((s) => {
          const cap = s.marketCap || 1e9
          return Math.sqrt(cap / 1e8)
        })
        const stockRects = squarify(stockWeights, 100, 100)
        stockLayouts = sector.stocks.map((stock, j) => ({
          stock,
          rect: stockRects[j],
        }))
      }

      return { sector, sectorRect: sRect, stockLayouts }
    })
  }, [data])

  const handleClick = useCallback(
    (stock: StockItem) => {
      if (onStockClick) onStockClick(stock)
    },
    [onStockClick]
  )

  if (loading && !data) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin />
      </div>
    )
  }

  if (error || !data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )
  }

  return (
    <div
      style={{
        height,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 4,
        background: '#0d0d0d',
      }}
    >
      {layoutData.map(({ sector, sectorRect, stockLayouts }) => {
        // 板块容器
        return (
          <div
            key={sector.code}
            style={{
              position: 'absolute',
              left: `${sectorRect.x}%`,
              top: `${sectorRect.y}%`,
              width: `${sectorRect.w}%`,
              height: `${sectorRect.h}%`,
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            {/* 板块内的股票 */}
            {stockLayouts.map(({ stock, rect }, idx) => {
              const bgColor = getColor(stock.changePct)
              const isHovered = hoveredStock === stock.symbol
              const cellW = (rect.w / 100) * sectorRect.w
              const cellH = (rect.h / 100) * sectorRect.h
              // 根据单元格大小决定显示内容
              const showName = cellW > 3 && cellH > 2
              const showPct = cellW > 4 && cellH > 3
              const isLarge = cellW > 8 && cellH > 5

              return (
                <Tooltip
                  key={stock.symbol}
                  title={
                    <div style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {stock.name} ({stock.symbol})
                      </div>
                      <div>板块: {sector.name}</div>
                      <div>价格: {stock.latestPrice?.toFixed(2) || '-'}</div>
                      <div>
                        涨跌幅:{' '}
                        <span style={{ color: stock.changePct >= 0 ? '#ff6b6b' : '#51cf66' }}>
                          {stock.changePct >= 0 ? '+' : ''}
                          {stock.changePct?.toFixed(2)}%
                        </span>
                      </div>
                      {stock.marketCap && <div>市值: {(stock.marketCap / 1e8).toFixed(0)}亿</div>}
                    </div>
                  }
                  placement="top"
                  mouseEnterDelay={0.3}
                >
                  <div
                    onClick={() => handleClick(stock)}
                    onMouseEnter={() => setHoveredStock(stock.symbol)}
                    onMouseLeave={() => setHoveredStock(null)}
                    style={{
                      position: 'absolute',
                      left: `${rect.x}%`,
                      top: `${rect.y}%`,
                      width: `${rect.w}%`,
                      height: `${rect.h}%`,
                      backgroundColor: bgColor,
                      border: '0.5px solid rgba(0,0,0,0.4)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                      transition: 'transform 0.1s, z-index 0.1s',
                      transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                      zIndex: isHovered ? 100 : 1,
                      boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.5)' : 'none',
                    }}
                  >
                    {showName && (
                      <div
                        style={{
                          fontSize: isLarge ? 11 : 9,
                          fontWeight: 600,
                          color: '#fff',
                          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '95%',
                          lineHeight: 1.2,
                        }}
                      >
                        {stock.name}
                      </div>
                    )}
                    {showPct && (
                      <div
                        style={{
                          fontSize: isLarge ? 10 : 8,
                          color: '#fff',
                          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                          opacity: 0.95,
                        }}
                      >
                        {stock.changePct >= 0 ? '+' : ''}
                        {stock.changePct?.toFixed(2)}%
                      </div>
                    )}
                  </div>
                </Tooltip>
              )
            })}

            {/* 板块名称标签 - 左上角小标签 */}
            {sectorRect.w > 5 && sectorRect.h > 4 && (
              <div
                style={{
                  position: 'absolute',
                  top: 1,
                  left: 1,
                  background: 'rgba(0,0,0,0.7)',
                  color: '#fff',
                  fontSize: sectorRect.w > 10 ? 9 : 7,
                  padding: '1px 3px',
                  borderRadius: 2,
                  zIndex: 50,
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  maxWidth: '90%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {sector.name}
              </div>
            )}

            {/* 板块边框 */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                border: '1px solid rgba(30,30,30,0.8)',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          </div>
        )
      })}

      {/* 加载遮罩 */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
          }}
        >
          <Spin />
        </div>
      )}
    </div>
  )
})

StockHeatmap.displayName = 'StockHeatmap'

export default StockHeatmap
