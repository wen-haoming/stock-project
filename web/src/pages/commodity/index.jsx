import { useState, useCallback } from 'react'
import { Row, Col, Radio, Grid, Button, Segmented, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { commodityConfig, categoryColors, periodOptions } from '@/constants/commodity'
import { CommodityCard, CommodityDetailDrawer } from './components'
import { useTheme } from '../../contexts/ThemeContext'

const { useBreakpoint } = Grid

/**
 * 大宗商品页面
 */
export default function CommodityPage() {
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const [searchParams, setSearchParams] = useSearchParams()
  const { theme: currentTheme, isDark } = useTheme()
  
  // 从 URL 读取筛选条件
  const period = searchParams.get('period') || '3m'
  const region = searchParams.get('region') || 'all'
  const selectedCategory = searchParams.get('category') || 'all'
  
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Drawer 状态
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [selectedCommodity, setSelectedCommodity] = useState(null)
  const [selectedData, setSelectedData] = useState(null)
  const [selectedCategoryColor, setSelectedCategoryColor] = useState('#1890ff')

  // 更新 URL 参数
  const updateSearchParams = useCallback((key, value) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      if (value === 'all' || value === '3m') {
        newParams.delete(key)
      } else {
        newParams.set(key, value)
      }
      return newParams
    })
  }, [setSearchParams])

  const setPeriod = (value) => updateSearchParams('period', value)
  const setRegion = (value) => updateSearchParams('region', value)
  const setCategory = (value) => updateSearchParams('category', value)

  // 过滤商品
  const getFilteredCommodities = (category) => {
    let items = commodityConfig[category] || []
    if (region !== 'all') {
      items = items.filter(c => c.region === region)
    }
    return items
  }

  // 打开详情
  const handleCardClick = (commodity, data, categoryColor) => {
    setSelectedCommodity(commodity)
    setSelectedData(data)
    setSelectedCategoryColor(categoryColor)
    setDrawerVisible(true)
  }

  return (
    <div style={{ padding: isMobile ? 8 : 0, background: currentTheme.custom.bgColorSecondary, minHeight: '100vh' }}>
      {/* 顶部控制栏 */}
      <div style={{ 
        background: currentTheme.custom.bgColor, 
        borderRadius: 8, 
        padding: isMobile ? 12 : 16, 
        marginBottom: isMobile ? 12 : 16,
        border: `1px solid ${currentTheme.custom.borderColor}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: isMobile ? 16 : 18, fontWeight: 600, color: currentTheme.custom.textColor }}>大宗商品走势</span>
            <Segmented
              size="small"
              value={region}
              onChange={setRegion}
              options={[
                { label: '全部', value: 'all' },
                { label: '国内', value: 'domestic' },
                { label: '国际', value: 'international' },
              ]}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio.Group 
              value={period} 
              onChange={(e) => setPeriod(e.target.value)} 
              size="small"
              optionType="button"
            >
              {periodOptions.map(opt => (
                <Radio.Button key={opt.value} value={opt.value}>
                  {opt.label}
                </Radio.Button>
              ))}
            </Radio.Group>
            <Button 
              size="small" 
              icon={<ReloadOutlined />}
              onClick={() => {
                setRefreshKey(k => k + 1)
                message.success('数据刷新中...')
              }}
            >
              刷新
            </Button>
          </div>
        </div>
        
        {/* 分类筛选 */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${currentTheme.custom.borderColor}` }}>
          <Radio.Group 
            value={selectedCategory} 
            onChange={(e) => setCategory(e.target.value)} 
            size="small"
            optionType="button"
          >
            <Radio.Button value="all">全部</Radio.Button>
            {Object.keys(commodityConfig).map(cat => (
              <Radio.Button key={cat} value={cat}>
                <span style={{ 
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: categoryColors[cat],
                  marginRight: 4,
                  verticalAlign: 'middle'
                }} />
                {cat}
              </Radio.Button>
            ))}
          </Radio.Group>
        </div>
      </div>

      {/* 商品卡片列表 */}
      {(selectedCategory === 'all' ? Object.keys(commodityConfig) : [selectedCategory]).map(category => {
        const items = getFilteredCommodities(category)
        if (items.length === 0) return null
        
        return (
          <div key={category} style={{ marginBottom: isMobile ? 16 : 20 }}>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
              paddingLeft: 2
            }}>
              <span style={{ 
                width: 3,
                height: 16,
                borderRadius: 2,
                background: categoryColors[category],
              }} />
              <span style={{ 
                fontSize: isMobile ? 14 : 15, 
                fontWeight: 600, 
                color: currentTheme.custom.textColor,
              }}>
                {category}
              </span>
              <span style={{ fontSize: 12, color: currentTheme.custom.textColorSecondary }}>
                ({items.length})
              </span>
            </div>
            <Row gutter={[isMobile ? 8 : 12, isMobile ? 8 : 12]}>
              {items.map((commodity, idx) => (
                <Col key={`${commodity.code}-${idx}`} xs={12} sm={8} md={6} lg={4} xl={4}>
                  <CommodityCard 
                    commodity={commodity} 
                    period={period} 
                    isMobile={isMobile}
                    categoryColor={categoryColors[category]}
                    onClick={(c, d) => handleCardClick(c, d, categoryColors[category])}
                    refreshKey={refreshKey}
                  />
                </Col>
              ))}
            </Row>
          </div>
        )
      })}

      {/* 详情抽屉 */}
      <CommodityDetailDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        commodity={selectedCommodity}
        data={selectedData}
        categoryColor={selectedCategoryColor}
        isMobile={isMobile}
      />
    </div>
  )
}
