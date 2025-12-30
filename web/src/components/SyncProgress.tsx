import { useState, useEffect } from 'react'
import { Badge, Popover, Progress, Space, Typography } from 'antd'
import { SyncOutlined } from '@ant-design/icons'
import axios from 'axios'

const { Text } = Typography

const marketNames = {
  a: 'A股',
  hk: '港股'
}

export default function SyncProgress({ theme = 'light' }) {
  const [syncData, setSyncData] = useState(null)

  const fetchProgress = async () => {
    try {
      const res = await axios.get('/api/v1/db/sync-progress')
      setSyncData(res.data?.data || null)
    } catch (e) {
      console.error('获取同步进度失败:', e)
    }
  }

  useEffect(() => {
    fetchProgress()
    const timer = setInterval(fetchProgress, 3000) // 每3秒刷新
    return () => clearInterval(timer)
  }, [])

  // 检查是否有正在同步的任务
  const syncingMarkets = syncData 
    ? Object.values(syncData).filter(m => m.status === 'syncing')
    : []
  
  const isSyncing = syncingMarkets.length > 0

  if (!isSyncing) {
    return null // 没有同步任务时不显示
  }

  const isDark = theme === 'dark'
  const textColor = isDark ? '#fff' : '#333'
  const bgColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)'

  const content = (
    <div style={{ minWidth: 280 }}>
      {syncingMarkets.map(market => {
        const percent = market.total > 0 
          ? Math.round((market.current / market.total) * 100) 
          : 0
        return (
          <div key={market.market} style={{ marginBottom: 12 }}>
            <Space style={{ marginBottom: 4 }}>
              <Text strong>{marketNames[market.market] || market.market}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {market.current}/{market.total}
              </Text>
            </Space>
            <Progress 
              percent={percent} 
              size="small" 
              status="active"
              format={p => `${p}%`}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              成功: {market.success} | 失败: {market.failed}
            </Text>
          </div>
        )
      })}
    </div>
  )

  return (
    <Popover 
      content={content} 
      title="数据同步进度" 
      trigger="hover"
      placement="bottomLeft"
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        cursor: 'pointer',
        padding: '4px 8px',
        borderRadius: 4,
        background: bgColor
      }}>
        <Badge status="processing" />
        <SyncOutlined spin style={{ color: '#52c41a', marginLeft: 4, marginRight: 6 }} />
        <span style={{ color: textColor, fontSize: 12 }}>
          同步中 {syncingMarkets.length > 0 && (
            <span>
              {Math.round((syncingMarkets[0].current / syncingMarkets[0].total) * 100)}%
            </span>
          )}
        </span>
      </div>
    </Popover>
  )
}
