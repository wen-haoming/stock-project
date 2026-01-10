import { memo, useState, useEffect, useRef } from 'react'
import { RiseOutlined, FallOutlined } from '@ant-design/icons'
import { fetchCommodityTrend } from '@/api/commodity'
import { useTheme } from '../../../contexts/ThemeContext'

/**
 * 商品卡片组件 - 简化版
 * @param {object} commodity - 商品配置
 * @param {string} cardWidth - 卡片宽度
 */
const CommodityCard = memo(({ commodity, isMobile, categoryColor, onClick, refreshKey, cardWidth }) => {
  const { theme: currentTheme, isDark } = useTheme()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const isFirstLoad = useRef(true)

  useEffect(() => {
    const loadData = async () => {
      if (isFirstLoad.current) {
        setLoading(true)
      }
      
      // 只获取分时数据用于显示价格和涨跌幅
      const result = await fetchCommodityTrend(commodity.code, commodity.market)
      
      setData(result)
      setLoading(false)
      isFirstLoad.current = false
    }
    loadData()
  }, [commodity, refreshKey])

  // 加载中时不渲染卡片
  if (loading) {
    return null
  }

  const isUp = data?.changePct >= 0
  const color = isUp ? '#cf1322' : '#389e0d'
  const Icon = isUp ? RiseOutlined : FallOutlined
  const displayName = commodity.label || commodity.name

  const handleClick = () => {
    if (onClick) {
      onClick(commodity, data)
    }
  }

  return (
    <div style={{ 
      width: cardWidth || 'auto',
      minWidth: isMobile ? 120 : 140,
      background: currentTheme.custom.bgColor,
      borderRadius: 6,
      border: `1px solid ${currentTheme.custom.borderColor}`,
      overflow: 'hidden',
      transition: 'box-shadow 0.2s',
      cursor: 'pointer',
    }}
    onClick={handleClick}
    onMouseEnter={(e) => e.currentTarget.style.boxShadow = isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)'}
    onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* 顶部分类色条 */}
      <div style={{ height: 2, background: categoryColor }} />
      
      <div style={{ padding: isMobile ? '6px 8px' : '8px 10px' }}>
        {/* 标题行 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ 
            fontSize: isMobile ? 12 : 13, 
            fontWeight: 600,
            color: currentTheme.custom.textColor
          }}>
            {displayName}
          </span>
          <span style={{ 
            fontSize: 9, 
            color: commodity.region === 'domestic' ? '#d48806' : '#1677ff',
            padding: '0px 4px',
            borderRadius: 8,
            background: commodity.region === 'domestic' 
              ? (isDark ? 'rgba(212,136,6,0.2)' : '#fffbe6') 
              : (isDark ? 'rgba(22,119,255,0.2)' : '#e6f4ff'),
          }}>
            {commodity.region === 'domestic' ? '国内' : '国际'}
          </span>
        </div>
        
        {/* 价格行 */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ 
            fontSize: isMobile ? 15 : 16, 
            fontWeight: 600, 
            color,
            letterSpacing: '-0.5px'
          }}>
            {data?.latestPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '--'}
          </span>
          <span style={{ fontSize: 11, color, fontWeight: 500 }}>
            <Icon style={{ marginRight: 2, fontSize: 9 }} />
            {isUp ? '+' : ''}{data?.changePct?.toFixed(2) || '0.00'}%
          </span>
        </div>
      </div>
    </div>
  )
})

CommodityCard.displayName = 'CommodityCard'

export default CommodityCard
