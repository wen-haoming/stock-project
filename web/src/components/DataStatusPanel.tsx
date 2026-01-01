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
  Statistic,
  Row,
  Col,
  Progress
} from 'antd'
import { 
  DatabaseOutlined, 
  SyncOutlined, 
  CheckCircleOutlined, 
  ExclamationCircleOutlined,
  CloudServerOutlined,
  LoadingOutlined,
  StopOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import axios from 'axios'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const { Text } = Typography

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

export default function DataStatusPanel() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [status, setStatus] = useState<DataStatus | null>(null)
  const [progress, setProgress] = useState<Record<string, SyncProgress>>({})
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const lastCompletedRef = useRef<Record<string, boolean>>({})

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
          // 有正在同步的任务
          setSyncing('all')
        } else {
          // 检查是否刚完成
          Object.entries(data).forEach(([market, p]) => {
            if (p.status === 'completed' && !lastCompletedRef.current[market]) {
              lastCompletedRef.current[market] = true
              message.success(`${market === 'a' ? 'A股' : '港股'}数据同步完成`)
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
          
          // 所有任务都完成了
          if (syncing) {
            setSyncing(null)
            fetchStatus()
          }
        }
      }
    } catch (err) {
      console.error('获取同步进度失败:', err)
    }
  }, [syncing])

  // 启动轮询
  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    
    // 立即获取一次
    fetchProgress()
    
    // 每500ms轮询一次
    pollingRef.current = setInterval(fetchProgress, 500)
  }, [fetchProgress])

  // 停止轮询
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  // 面板打开时启动轮询，关闭时停止
  useEffect(() => {
    if (open) {
      fetchStatus()
      startPolling()
    } else {
      stopPolling()
    }
    return () => stopPolling()
  }, [open, startPolling, stopPolling])

  // 组件挂载时检查是否有正在进行的同步
  useEffect(() => {
    fetchProgress()
  }, [])

  const handleSync = async (market: 'a' | 'hk' | 'all') => {
    // 重置完成状态
    lastCompletedRef.current = {}
    
    try {
      const res = await axios.post(`/api/v1/db/sync?market=${market}`)
      if (res.data.code === 0) {
        setSyncing(market === 'all' ? 'all' : market)
        message.info('同步任务已启动')
        // 确保轮询在运行
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

  const handleResetAndSync = async () => {
    // 重置完成状态
    lastCompletedRef.current = {}
    
    try {
      const res = await axios.post('/api/v1/db/reset-sync?market=all')
      if (res.data.code === 0) {
        setSyncing('all')
        message.info('清空并同步任务已启动')
        // 确保轮询在运行
        startPolling()
      } else {
        message.error(res.data.error || '启动清空并同步失败')
      }
    } catch (err: any) {
      if (err.response?.status === 409) {
        message.warning('已有同步任务在进行中')
        setSyncing('all')
        startPolling()
      } else {
        message.error(err.response?.data?.error || '清空并同步请求失败')
      }
    }
  }

  const handleClearKlines = async (market: 'a' | 'hk' | 'all') => {
    const marketName = market === 'a' ? 'A股' : market === 'hk' ? '港股' : '全部'
    try {
      const res = await axios.post(`/api/v1/db/clear-klines?market=${market}`)
      if (res.data.code === 0) {
        message.success(`${marketName}K线数据已清空，共删除 ${res.data.deleted} 条`)
        fetchStatus()
      } else {
        message.error(res.data.error || '清空K线失败')
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '清空K线请求失败')
    }
  }

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '从未同步'
    const time = dayjs(timeStr)
    return `${time.format('MM-DD HH:mm')} (${time.fromNow()})`
  }

  const getStatusTag = (needsUpdate: boolean, lastUpdate?: string) => {
    if (!lastUpdate) {
      return <Tag color="error" icon={<ExclamationCircleOutlined />}>未同步</Tag>
    }
    if (needsUpdate) {
      return <Tag color="warning" icon={<ExclamationCircleOutlined />}>需更新</Tag>
    }
    return <Tag color="success" icon={<CheckCircleOutlined />}>已同步</Tag>
  }

  // 判断整体状态
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

  // 获取进度条状态
  const getProgressStatus = (p: SyncProgress) => {
    if (p.status === 'error') return 'exception'
    if (p.status === 'completed') return 'success'
    return 'active'
  }

  // 渲染同步进度
  const renderSyncProgress = (market: 'a' | 'hk') => {
    const p = progress[market]
    if (!p || p.status === 'idle') return null

    // 判断是否在同步K线
    const isSyncingKline = p.status === 'syncing_kline' || p.phase?.includes('K线')
    const phaseText = p.phase || ''
    const messageText = p.message || ''

    return (
      <div style={{ marginTop: 8 }}>
        <Progress 
          percent={p.percent} 
          status={getProgressStatus(p)}
          size="small"
          strokeColor={p.status === 'error' ? '#ff4d4f' : isSyncingKline ? '#722ed1' : undefined}
        />
        <Text type="secondary" style={{ fontSize: 11 }}>
          {isSyncingKline && '📊 '}{phaseText} {messageText && `- ${messageText}`}
        </Text>
      </div>
    )
  }

  const content = (
    <div style={{ width: 340 }}>
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

          {/* 数据统计 */}
          <Row gutter={8} style={{ marginBottom: 12 }}>
            <Col span={6}>
              <Statistic 
                title="A股" 
                value={status.a_stocks} 
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="港股" 
                value={status.hk_stocks} 
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="A股K线" 
                value={status.a_klines || 0} 
                valueStyle={{ fontSize: 14 }}
                formatter={(val) => Number(val) > 10000 ? `${(Number(val) / 10000).toFixed(1)}万` : String(val)}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="港股K线" 
                value={status.hk_klines || 0} 
                valueStyle={{ fontSize: 14 }}
                formatter={(val) => Number(val) > 10000 ? `${(Number(val) / 10000).toFixed(1)}万` : String(val)}
              />
            </Col>
          </Row>

          <Divider style={{ margin: '8px 0' }} />

          {/* A股状态 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Space>
                <Text strong>A股数据</Text>
                {syncing === 'a' || syncing === 'all' ? (
                  <Tag color="processing" icon={<LoadingOutlined />}>同步中</Tag>
                ) : (
                  getStatusTag(status.a_needs_update, status.a_last_update)
                )}
              </Space>
              <Button 
                size="small" 
                type="link"
                icon={<SyncOutlined spin={syncing === 'a'} />}
                loading={syncing === 'a'}
                disabled={syncing !== null}
                onClick={() => handleSync('a')}
              >
                同步
              </Button>
            </div>
            {syncing === 'a' || syncing === 'all' ? (
              renderSyncProgress('a')
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                更新时间: {formatTime(status.a_last_update)}
              </Text>
            )}
          </div>

          {/* 港股状态 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Space>
                <Text strong>港股数据</Text>
                {syncing === 'hk' || syncing === 'all' ? (
                  <Tag color="processing" icon={<LoadingOutlined />}>同步中</Tag>
                ) : (
                  getStatusTag(status.hk_needs_update, status.hk_last_update)
                )}
              </Space>
              <Button 
                size="small" 
                type="link"
                icon={<SyncOutlined spin={syncing === 'hk'} />}
                loading={syncing === 'hk'}
                disabled={syncing !== null}
                onClick={() => handleSync('hk')}
              >
                同步
              </Button>
            </div>
            {syncing === 'hk' || syncing === 'all' ? (
              renderSyncProgress('hk')
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                更新时间: {formatTime(status.hk_last_update)}
              </Text>
            )}
          </div>

          {/* 缓存状态 */}
          {status.cache && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              <div>
                <Space style={{ marginBottom: 4 }}>
                  <Text strong>实时缓存</Text>
                  {status.cache.healthy ? (
                    <Tag color="success">健康</Tag>
                  ) : (
                    <Tag color="warning">待预热</Tag>
                  )}
                </Space>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    缓存: A股 {status.cache.aCount}只, 港股 {status.cache.hkCount}只
                  </Text>
                </div>
              </div>
            </>
          )}

          <Divider style={{ margin: '8px 0' }} />

          {/* 全量同步按钮 / 取消按钮 */}
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
                onClick={() => handleSync('all')}
              >
                同步全部数据
              </Button>
              <Space.Compact block>
                <Button 
                  style={{ flex: 1 }}
                  icon={<DeleteOutlined />}
                  onClick={() => handleClearKlines('a')}
                >
                  清空A股K线
                </Button>
                <Button 
                  style={{ flex: 1 }}
                  icon={<DeleteOutlined />}
                  onClick={() => handleClearKlines('hk')}
                >
                  清空港股K线
                </Button>
              </Space.Compact>
              <Button 
                block 
                danger
                icon={<DeleteOutlined />}
                onClick={handleResetAndSync}
              >
                清空并重新同步
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
          <span>数据同步状态</span>
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
