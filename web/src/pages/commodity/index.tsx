import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Radio, Grid, Button, Segmented, message, Spin } from 'antd'
import { ReloadOutlined, RiseOutlined, FallOutlined, FireOutlined, FileTextOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { commodityConfig, categoryColors } from '@/constants/commodity'
import { CommodityCard, CommodityDetailDrawer } from './components'
import { useTheme } from '../../contexts/ThemeContext'
import { fetchCommodityTrend, fetchCommodityNews } from '@/api/commodity'

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
  const region = searchParams.get('region') || 'all'
  const selectedCategory = searchParams.get('category') || 'all'
  
  const [refreshKey, setRefreshKey] = useState(0)
  
  // 热门期货数据
  const [topPerformers, setTopPerformers] = useState<Array<{commodity: any, data: any, category: string}>>([])
  const [loadingTop, setLoadingTop] = useState(true)
  
  // 新闻数据
  const [newsList, setNewsList] = useState<Array<{title: string, url: string, source: string, time: string}>>([])
  const [loadingNews, setLoadingNews] = useState(true)
  const newsContainerRef = useRef<HTMLDivElement>(null)
  
  // 获取所有商品列表
  const allCommodities = useMemo(() => {
    const result: Array<{commodity: any, category: string}> = []
    Object.entries(commodityConfig).forEach(([category, items]) => {
      items.forEach(item => result.push({ commodity: item, category }))
    })
    return result
  }, [])
  
  // 加载热门期货数据
  useEffect(() => {
    const loadTopPerformers = async () => {
      setLoadingTop(true)
      try {
        const results = await Promise.all(
          allCommodities.map(async ({ commodity, category }) => {
            const data = await fetchCommodityTrend(commodity.code, commodity.market)
            return { commodity, data, category }
          })
        )
        // 按涨跌幅绝对值排序，取前5名
        const sorted = results
          .filter(r => r.data && r.data.latestPrice > 0)
          .sort((a, b) => Math.abs(b.data.changePct) - Math.abs(a.data.changePct))
          .slice(0, 5)
        setTopPerformers(sorted)
      } catch (error) {
        console.error('加载热门期货失败:', error)
      }
      setLoadingTop(false)
    }
    loadTopPerformers()
  }, [allCommodities, refreshKey])
  
  // 加载新闻数据
  useEffect(() => {
    const loadNews = async () => {
      setLoadingNews(true)
      try {
        const news = await fetchCommodityNews('大宗商品 期货')
        setNewsList(news)
      } catch (error) {
        console.error('加载新闻失败:', error)
      }
      setLoadingNews(false)
    }
    loadNews()
  }, [refreshKey])
  
  // 新闻自动滚动
  useEffect(() => {
    if (!newsContainerRef.current || newsList.length === 0 || isMobile) return
    
    const container = newsContainerRef.current
    let scrollInterval: NodeJS.Timeout
    let isPaused = false
    
    const startScroll = () => {
      scrollInterval = setInterval(() => {
        if (!isPaused && container) {
          if (container.scrollTop >= container.scrollHeight - container.clientHeight) {
            container.scrollTop = 0
          } else {
            container.scrollTop += 1
          }
        }
      }, 50)
    }
    
    const handleMouseEnter = () => { isPaused = true }
    const handleMouseLeave = () => { isPaused = false }
    
    container.addEventListener('mouseenter', handleMouseEnter)
    container.addEventListener('mouseleave', handleMouseLeave)
    startScroll()
    
    return () => {
      clearInterval(scrollInterval)
      container.removeEventListener('mouseenter', handleMouseEnter)
      container.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [newsList, isMobile])
  
  // Drawer 状态
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [selectedCommodity, setSelectedCommodity] = useState(null)
  const [selectedData, setSelectedData] = useState(null)
  const [selectedCategoryColor, setSelectedCategoryColor] = useState('#1890ff')

  // 更新 URL 参数
  const updateSearchParams = useCallback((key, value) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      if (value === 'all') {
        newParams.delete(key)
      } else {
        newParams.set(key, value)
      }
      return newParams
    })
  }, [setSearchParams])

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
      <div style={{ display: 'flex', gap: 16 }}>
        {/* 左侧主内容区 */}
        <div style={{ flex: 1, minWidth: 0 }}>
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
        
        {/* 近期表现突出的期货 */}
        <div style={{ 
          marginTop: 12, 
          paddingTop: 12, 
          borderTop: `1px solid ${currentTheme.custom.borderColor}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 4,
            color: currentTheme.custom.textColorSecondary,
            fontSize: 12,
            flexShrink: 0
          }}>
            <FireOutlined style={{ color: '#fa541c' }} />
            <span>今日异动</span>
          </div>
          {loadingTop ? (
            <Spin size="small" />
          ) : (
            <div style={{ display: 'flex', gap: isMobile ? 6 : 10, flexWrap: 'wrap', flex: 1 }}>
              {topPerformers.map(({ commodity, data, category }) => {
                const isUp = data.changePct >= 0
                const color = isUp ? '#cf1322' : '#389e0d'
                return (
                  <div
                    key={commodity.code}
                    onClick={() => handleCardClick(commodity, data, categoryColors[category])}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'}
                  >
                    <span style={{ 
                      fontSize: 12, 
                      color: currentTheme.custom.textColor,
                      fontWeight: 500
                    }}>
                      {commodity.label || commodity.name}
                    </span>
                    <span style={{ 
                      fontSize: 11, 
                      color, 
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2
                    }}>
                      {isUp ? <RiseOutlined style={{ fontSize: 9 }} /> : <FallOutlined style={{ fontSize: 9 }} />}
                      {isUp ? '+' : ''}{data.changePct.toFixed(2)}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
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
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: isMobile ? 8 : 12,
            }}>
              {items.map((commodity, idx) => (
                <CommodityCard 
                  key={`${commodity.code}-${idx}`}
                  commodity={commodity} 
                  isMobile={isMobile}
                  categoryColor={categoryColors[category]}
                  onClick={(c, d) => handleCardClick(c, d, categoryColors[category])}
                  refreshKey={refreshKey}
                  cardWidth={isMobile ? 'calc(50% - 4px)' : 'calc(16.666% - 10px)'}
                />
              ))}
            </div>
          </div>
        )
      })}
        </div>
        
        {/* 右侧新闻模块 - 仅PC端显示 */}
        {!isMobile && (
          <div style={{ 
            width: 280, 
            flexShrink: 0,
            background: currentTheme.custom.bgColor,
            borderRadius: 8,
            border: `1px solid ${currentTheme.custom.borderColor}`,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            position: 'sticky',
            top: 0,
            height: 'calc(100vh - 16px)',
            maxHeight: 'calc(100vh - 16px)',
          }}>
            {/* 新闻标题 */}
            <div style={{ 
              padding: '12px 14px',
              borderBottom: `1px solid ${currentTheme.custom.borderColor}`,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
            }}>
              <FileTextOutlined style={{ color: '#1677ff', fontSize: 14 }} />
              <span style={{ 
                fontSize: 14, 
                fontWeight: 600, 
                color: currentTheme.custom.textColor 
              }}>
                财经快讯
              </span>
            </div>
            
            {/* 新闻列表 */}
            <div 
              ref={newsContainerRef}
              style={{ 
                flex: 1,
                overflow: 'hidden',
                padding: '8px 0',
              }}
            >
              {loadingNews ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                  <Spin size="small" />
                </div>
              ) : newsList.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: 20, 
                  color: currentTheme.custom.textColorSecondary,
                  fontSize: 13
                }}>
                  暂无相关资讯
                </div>
              ) : (
                <>
                  {/* 复制一份用于无缝滚动 */}
                  {[...newsList, ...newsList].map((news, idx) => (
                    <a
                      key={idx}
                      href={news.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'block',
                        padding: '10px 14px',
                        textDecoration: 'none',
                        borderBottom: `1px solid ${currentTheme.custom.borderColor}`,
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ 
                        fontSize: 13, 
                        color: currentTheme.custom.textColor,
                        lineHeight: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        marginBottom: 6,
                      }}>
                        {news.title}
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        fontSize: 11,
                        color: currentTheme.custom.textColorSecondary,
                      }}>
                        <span>{news.source}</span>
                        <span>{news.time}</span>
                      </div>
                    </a>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

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
