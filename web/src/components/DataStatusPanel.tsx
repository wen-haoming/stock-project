import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Button, 
  Popover, 
  Space, 
  Typography, 
  Divider, 
  Tag, 
  Spin,
  message,
  Progress,
  Modal,
  DatePicker,
  Select,
  Tabs,
  Card,
  Tooltip
} from 'antd'
import { 
  DatabaseOutlined, 
  SyncOutlined, 
  CloudServerOutlined,
  LoadingOutlined,
  StopOutlined,
  DeleteOutlined,
  CalendarOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import axios from 'axios'
import dayjs, { Dayjs } from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const { Text } = Typography
const { RangePicker } = DatePicker

interface DataStatus {
  connected: boolean
  hk_stocks: number
  a_stocks: number
  klines: number
  a_klines?: number
  hk_klines?: number
  hk_last_update?: string
  a_last_update?: string
  hk_needs_update: boolean
  a_needs_update: boolean
  cache?: {
    aCount: number
    hkCount: number
    lastSyncA: string
    lastSyncHK: string
    initialized: boolean
    healthy: boolean
  }
}

interface KlineDateRange {
  minDate: string
  maxDate: string
  count: number
}

interface SyncProgress {
  market: string
  status: string
  phase: string
  current: number
  total: number
  percent: number
  message: string
  error?: string
}

// 日期预设选项
const datePresets = [
  { label: '近1周', value: 7 },
  { label: '近2周', value: 14 },
  { label: '近1月', value: 30 },
  { label: '近3月', value: 90 },
  { label: '近6月', value: 180 },
  { label: '近1年', value: 365 },
  { label: '近2年', value: 730 },
]

export default function DataStatusPanel() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [status, setStatus] = useState<DataStatus | null>(null)
  const [progress, setProgress] = useState<Record<string, SyncProgress>>({})
  const [klineRanges, setKlineRanges] = useState<{ a?: KlineDateRange; hk?: KlineDateRange }>({})
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(7)
  const [activeMarket, setActiveMarket] = useState<'a' | 'hk'>('a')
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const lastCompletedRef = useRef<Record<string, boolean>>({})

  // 根据预设设置日期范围
  useEffect(() => {
    if (selectedPreset) {
      const end = dayjs()
      const start = dayjs().subtract(selectedPreset, 'day')
      setDateRange([start, end])
    }
  }, [selectedPreset])

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/v1/db/status')
      if (res.data.code === 0) {
        setStatus(res.data.data)
      }
    } catch (err) {
      console.error('获取数据状态失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchKlineRanges = async () => {
    try {
      const res = await axios.get('/api/v1/db/kline-range')
      if (res.data.code === 0) {
        setKlineRanges(res.data.data)
      }
    } catch (err) {
      console.error('获取K线日期范围失败:', err)
    }
  }

  // 获取同步进度
  const fetchProgress = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/db/sync-progress')
      if (res.data.code === 0) {
        const data = res.data.data as Record<string, SyncProgress>
        setProgress(data)
        
        // 检查是否有正在同步的任务
        const activeSyncing = Object.entries(data).find(
          ([, p]) => p.status !== 'idle' && p.status !== 'completed' && p.status !== 'error' && p.status !== 'cancelled'
        )
        
        if (activeSyncing) {
          setSyncing('all')
        } else {
          // 检查是否刚完成
          Object.entries(data).forEach(([market, p]) => {
            if (p.status === 'completed' && !lastCompletedRef.current[market]) {
              lastCompletedRef.current[market] = true
              message.success(`${market === 'a' ? 'A股' : '港股'}数据同步完成`)
              fetchKlineRanges() // 刷新日期范围
            } else if (p.status === 'error' && !lastCompletedRef.current[market]) {
              lastCompletedRef.current[market] = true
              message.error(`${market === 'a' ? 'A股' : '港股'}同步失败: ${p.error}`)
            } else if (p.status === 'cancelled' && !lastCompletedRef.current[market]) {
              lastCompletedRef.current[market] = true
              message.warning(`${market === 'a' ? 'A股' : '港股'}同步已取消`)
            } else if (p.status === 'idle') {
              lastCompletedRef.current[market] = false
            }
          })
          
          if (syncing) {
            setSyncing(null)
            fetchStatus()
            fetchKlineRanges()
          }
        }
      }
    } catch (err) {
      console.error('获取同步进度失败:', err)
    }
  }, [syncing])

  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    fetchProgress()
    pollingRef.current = setInterval(fetchProgress, 500)
  }, [fetchProgress])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchStatus()
      fetchKlineRanges()
      startPolling()
    } else {
      stopPolling()
    }
    return () => stopPolling()
  }, [open, startPolling, stopPolling])

  useEffect(() => {
    fetchProgress()
  }, [])

  // 按日期范围同步K线
  const handleSyncByDateRange = async (market: 'a' | 'hk' | 'all') => {
    if (!dateRange) {
      message.warning('请选择日期范围')
      return
    }

    lastCompletedRef.current = {}
    const startDate = dateRange[0].format('YYYY-MM-DD')
    const endDate = dateRange[1].format('YYYY-MM-DD')

    try {
      const res = await axios.post(`/api/v1/db/sync-kline-range?market=${market}&start_date=${startDate}&end_date=${endDate}`)
      if (res.data.code === 0) {
        setSyncing(market === 'all' ? 'all' : market)
        message.info(`开始同步 ${startDate} ~ ${endDate} 的K线数据`)
        startPolling()
      } else {
        message.error(res.data.error || '启动同步失败')
      }
    } catch (err: any) {
      if (err.response?.status === 409) {
        message.warning('已有同步任务在进行中')
        setSyncing('all')
        startPolling()
      } else {
        message.error(err.response?.data?.error || '同步请求失败')
      }
    }
  }

  // 按日期范围删除K线
  const handleDeleteByDateRange = (market: 'a' | 'hk' | 'all') => {
    if (!dateRange) {
      message.warning('请选择日期范围')
      return
    }

    const startDate = dateRange[0].format('YYYY-MM-DD')
    const endDate = dateRange[1].format('YYYY-MM-DD')
    const marketName = market === 'a' ? 'A股' : market === 'hk' ? '港股' : '全部'

    Modal.confirm({
      title: `确认删除${marketName}K线数据？`,
      content: `将删除 ${startDate} ~ ${endDate} 范围内的K线数据`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await axios.post(`/api/v1/db/delete-kline-range?market=${market}&start_date=${startDate}&end_date=${endDate}`)
          if (res.data.code === 0) {
            message.success(`已删除 ${res.data.deleted} 条K线数据`)
            fetchStatus()
            fetchKlineRanges()
          } else {
            message.error(res.data.error || '删除失败')
          }
        } catch (err: any) {
          message.error(err.response?.data?.error || '删除请求失败')
        }
      }
    })
  }

  const handleCancelSync = async () => {
    try {
      const res = await axios.post('/api/v1/db/sync-cancel?market=all')
      if (res.data.code === 0) {
        message.info(res.data.message)
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '取消同步失败')
    }
  }

  const [clearing, setClearing] = useState(false)

  const handleClearAllKlines = (market: 'a' | 'hk' | 'all') => {
    const marketName = market === 'a' ? 'A股' : market === 'hk' ? '港股' : '全部'
    Modal.confirm({
      title: `确认清空${marketName}K线数据？`,
      content: '此操作将清空所有K线数据，清空后需要重新同步。',
      okText: '确认清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setClearing(true)
        try {
          const res = await axios.post(`/api/v1/db/clear-klines?market=${market}`)
          if (res.data.code === 0) {
            message.success(`K线数据已清空，共删除 ${res.data.deleted} 条`)
            fetchStatus()
            fetchKlineRanges()
          } else {
            message.error(res.data.error || '清空K线失败')
          }
        } catch (err: any) {
          message.error(err.response?.data?.error || '清空K线请求失败')
        } finally {
          setClearing(false)
        }
      }
    })
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return dayjs(dateStr).format('YYYY-MM-DD')
  }

  const formatCount = (count?: number) => {
    if (!count) return '0'
    if (count > 10000) return `${(count / 10000).toFixed(1)}万`
    return String(count)
  }

  const getOverallStatus = () => {
    if (!status) return 'default'
    if (!status.connected) return 'error'
    if (status.hk_needs_update || status.a_needs_update) return 'warning'
    return 'success'
  }

  const overallStatus = getOverallStatus()
  const statusColors: Record<string, string> = {
    success: '#52c41a',
    warning: '#faad14',
    error: '#ff4d4f',
    default: '#d9d9d9'
  }

  const getProgressStatus = (p: SyncProgress) => {
    if (p.status === 'error') return 'exception'
    if (p.status === 'completed') return 'success'
    return 'active'
  }

  // 渲染市场数据卡片
  const renderMarketCard = (market: 'a' | 'hk') => {
    const marketName = market === 'a' ? 'A股' : '港股'
    const range = klineRanges[market]
    const p = progress[market]
    const isSyncing = p && p.status !== 'idle' && p.status !== 'completed' && p.status !== 'error' && p.status !== 'cancelled'
    const stockCount = market === 'a' ? status?.a_stocks : status?.hk_stocks
    const klineCount = market === 'a' ? status?.a_klines : status?.hk_klines

    return (
      <Card 
        size="small" 
        title={
          <Space>
            <span>{marketName}</span>
            {isSyncing && <LoadingOutlined style={{ color: '#1890ff' }} />}
          </Space>
        }
        style={{ marginBottom: 12 }}
      >
        {/* 数据统计 */}
        <div style={{ marginBottom: 8 }}>
          <Space split={<Divider type="vertical" />}>
            <Text type="secondary">股票: <Text strong>{stockCount || 0}</Text></Text>
            <Text type="secondary">K线: <Text strong>{formatCount(klineCount)}</Text></Text>
          </Space>
        </div>

        {/* 已同步日期范围 */}
        <div style={{ marginBottom: 8, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4 }}>
          <Space>
            <CalendarOutlined />
            <Text type="secondary">已同步:</Text>
            {range?.minDate ? (
              <Text strong style={{ color: '#1890ff' }}>
                {formatDate(range.minDate)} ~ {formatDate(range.maxDate)}
              </Text>
            ) : (
              <Text type="secondary">暂无数据</Text>
            )}
          </Space>
        </div>

        {/* 同步进度 */}
        {isSyncing && p && (
          <div style={{ marginBottom: 8 }}>
            <Progress 
              percent={p.percent} 
              status={getProgressStatus(p)}
              size="small"
              strokeColor={p.status === 'error' ? '#ff4d4f' : '#722ed1'}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              {p.phase} {p.message && `- ${p.message}`}
            </Text>
          </div>
        )}

        {/* 操作按钮 */}
        <Space wrap>
          <Button 
            size="small" 
            type="primary"
            icon={<SyncOutlined spin={isSyncing} />}
            disabled={syncing !== null}
            onClick={() => handleSyncByDateRange(market)}
          >
            同步
          </Button>
          <Button 
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={syncing !== null}
            onClick={() => handleDeleteByDateRange(market)}
          >
            删除区间
          </Button>
          <Button 
            size="small"
            icon={<DeleteOutlined />}
            disabled={syncing !== null}
            loading={clearing}
            onClick={() => handleClearAllKlines(market)}
          >
            清空全部
          </Button>
        </Space>
      </Card>
    )
  }

  const content = (
    <div style={{ width: 380 }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <Spin />
        </div>
      ) : status ? (
        <>
          {/* 连接状态 */}
          <div style={{ marginBottom: 12 }}>
            <Space>
              <CloudServerOutlined />
              <Text strong>数据库连接</Text>
              {status.connected ? (
                <Tag color="success">已连接</Tag>
              ) : (
                <Tag color="error">未连接</Tag>
              )}
            </Space>
          </div>

          <Divider style={{ margin: '8px 0' }} />

          {/* 日期范围选择 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <Space>
                <Text strong>同步日期范围</Text>
                <Tooltip title="选择要同步或删除的K线数据日期范围">
                  <InfoCircleOutlined style={{ color: '#999' }} />
                </Tooltip>
              </Space>
            </div>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Select
                style={{ width: '100%' }}
                placeholder="选择预设时间范围"
                value={selectedPreset}
                onChange={(val) => setSelectedPreset(val)}
                allowClear
                onClear={() => setSelectedPreset(null)}
              >
                {datePresets.map(p => (
                  <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>
                ))}
              </Select>
              <RangePicker
                style={{ width: '100%' }}
                value={dateRange}
                onChange={(dates) => {
                  setDateRange(dates as [Dayjs, Dayjs] | null)
                  if (dates) setSelectedPreset(null)
                }}
                format="YYYY-MM-DD"
              />
            </Space>
          </div>

          <Divider style={{ margin: '8px 0' }} />

          {/* 市场标签页 */}
          <Tabs
            activeKey={activeMarket}
            onChange={(key) => setActiveMarket(key as 'a' | 'hk')}
            size="small"
            items={[
              { key: 'a', label: 'A股', children: renderMarketCard('a') },
              { key: 'hk', label: '港股', children: renderMarketCard('hk') },
            ]}
          />

          <Divider style={{ margin: '8px 0' }} />

          {/* 全局操作 */}
          {syncing ? (
            <Button 
              block 
              danger
              icon={<StopOutlined />}
              onClick={handleCancelSync}
            >
              取消同步
            </Button>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button 
                block 
                type="primary"
                icon={<SyncOutlined />}
                onClick={() => handleSyncByDateRange('all')}
                disabled={!dateRange}
              >
                同步全部（A股+港股）
              </Button>
              <Button 
                block
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleClearAllKlines('all')}
                loading={clearing}
              >
                清空全部K线数据
              </Button>
            </Space>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <Text type="secondary">无法获取数据状态</Text>
        </div>
      )}
    </div>
  )

  return (
    <Popover
      content={content}
      title={
        <Space>
          <DatabaseOutlined />
          <span>数据同步管理</span>
          {syncing && <LoadingOutlined style={{ color: '#1890ff' }} />}
        </Space>
      }
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
    >
      <Button
        type="text"
        size="small"
        icon={<DatabaseOutlined style={{ color: syncing ? '#1890ff' : statusColors[overallStatus] }} />}
        style={{ 
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span style={{ 
          width: 6, 
          height: 6, 
          borderRadius: '50%', 
          backgroundColor: syncing ? '#1890ff' : statusColors[overallStatus],
          marginLeft: 4,
          animation: syncing ? 'pulse 1.5s infinite' : 'none'
        }} />
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </Button>
    </Popover>
  )
}
