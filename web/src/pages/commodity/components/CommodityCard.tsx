import { memo, useState, useEffect, useRef } from 'react'
import { Tooltip } from 'antd'
import { RiseOutlined, FallOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { fetchCommodityTrend } from '@/api/commodity'
import { getImpactAnalysis } from '@/constants/impactAnalysis'
import { useTheme } from '../../../contexts/ThemeContext'
import ImpactTag from './ImpactTag'

/**
 * 商品卡片组件
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
  const impact = getImpactAnalysis(commodity.name, data?.changePct || 0, data?.latestPrice || 0)

  const handleClick = () => {
    if (onClick) {
      onClick(commodity, data)
    }
  }

  return (
    <div style={{ 
      width: cardWidth || 'auto',
      minWidth: isMobile ? 150 : 180,
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
      
      <div style={{ padding: isMobile ? '8px 10px' : '10px 12px' }}>
        {/* 标题行 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ 
            fontSize: isMobile ? 13 : 14, 
            fontWeight: 600,
            color: currentTheme.custom.textColor
          }}>
            {displayName}
          </span>
          <span style={{ 
            fontSize: 10, 
            color: commodity.region === 'domestic' ? '#d48806' : '#1677ff',
            padding: '1px 6px',
            borderRadius: 10,
            background: commodity.region === 'domestic' 
              ? (isDark ? 'rgba(212,136,6,0.2)' : '#fffbe6') 
              : (isDark ? 'rgba(22,119,255,0.2)' : '#e6f4ff'),
          }}>
            {commodity.region === 'domestic' ? '国内' : '国际'}
          </span>
        </div>
        
        {/* 价格行 */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ 
            fontSize: isMobile ? 18 : 20, 
            fontWeight: 600, 
            color,
            letterSpacing: '-0.5px'
          }}>
            {data?.latestPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '--'}
          </span>
          <span style={{ fontSize: 12, color, fontWeight: 500 }}>
            <Icon style={{ marginRight: 2, fontSize: 10 }} />
            {isUp ? '+' : ''}{data?.changePct?.toFixed(2) || '0.00'}%
          </span>
        </div>

        {/* 分隔线 */}
        <div style={{ height: 1, background: currentTheme.custom.borderColor, margin: '8px 0' }} />

        {/* 影响分析 */}
        <div style={{ fontSize: 11 }}>
          <Tooltip title={impact.desc} placement="top">
            <div style={{ 
              color: currentTheme.custom.textColorSecondary, 
              fontSize: 10, 
              marginBottom: 6,
              cursor: 'help',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              <InfoCircleOutlined style={{ fontSize: 10 }} />
              <span>市场影响</span>
            </div>
          </Tooltip>
          
          {/* A股 */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: currentTheme.custom.textColorSecondary, fontSize: 10, width: 28 }}>A股</span>
              <ImpactTag trend={impact.aStock.trend} />
            </div>
            <Tooltip title={impact.aStock.detail} placement="top">
              <div style={{ 
                color: currentTheme.custom.textColor, 
                fontSize: 10, 
                marginTop: 2,
                paddingLeft: 28,
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap',
                cursor: 'help'
              }}>
                {impact.aStock.stocks}
              </div>
            </Tooltip>
          </div>

          {/* 港股 */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: currentTheme.custom.textColorSecondary, fontSize: 10, width: 28 }}>港股</span>
              <ImpactTag trend={impact.hkStock.trend} />
            </div>
            <Tooltip title={impact.hkStock.detail} placement="top">
              <div style={{ 
                color: currentTheme.custom.textColor, 
                fontSize: 10, 
                marginTop: 2,
                paddingLeft: 28,
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap',
                cursor: 'help'
              }}>
                {impact.hkStock.stocks}
              </div>
            </Tooltip>
          </div>

          {/* 美股 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: currentTheme.custom.textColorSecondary, fontSize: 10, width: 28 }}>美股</span>
              <ImpactTag trend={impact.usStock.trend} />
            </div>
            <Tooltip title={impact.usStock.detail} placement="top">
              <div style={{ 
                color: currentTheme.custom.textColor, 
                fontSize: 10, 
                marginTop: 2,
                paddingLeft: 28,
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap',
                cursor: 'help'
              }}>
                {impact.usStock.stocks}
              </div>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
})

CommodityCard.displayName = 'CommodityCard'

export default CommodityCard
