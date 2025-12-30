import { memo, useState } from 'react'
import { Card, Table, Radio, Button, Space, Tooltip, message } from 'antd'
import { DownloadOutlined, FileTextOutlined } from '@ant-design/icons'
import { announcementCategories } from '@/constants/finance'

/**
 * 公告表格组件
 */
const AnnouncementTable = memo(({ 
  stockSymbol, 
  market = 'hk', 
  announcements = [], 
  total = 0,
  loading = false, 
  category = '0', 
  onCategoryChange,
  pagination,
  onPaginationChange 
}) => {
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [downloading, setDownloading] = useState(false)

  // 根据市场生成不同的外部链接
  let ths10jqkaUrl, exchangeUrl, exchangeName

  if (market === 'a') {
    ths10jqkaUrl = `https://stockpage.10jqka.com.cn/${stockSymbol}/news/#pub`
    exchangeUrl = `http://www.cninfo.com.cn/new/disclosure/stock?stockCode=${stockSymbol}`
    exchangeName = '巨潮资讯'
  } else {
    ths10jqkaUrl = `https://stockpage.10jqka.com.cn/HK${stockSymbol}/news/#pub`
    exchangeUrl = `https://www1.hkexnews.hk/search/titlesearch.xhtml?lang=zh&stock=${stockSymbol}`
    exchangeName = '港交所披露易'
  }

  // 下载单个 PDF
  const downloadPdf = async (record) => {
    try {
      const response = await fetch(record.pdfUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${record.title}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      message.error('下载失败')
    }
  }

  // 批量下载选中的 PDF
  const handleBatchDownload = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要下载的公告')
      return
    }
    
    setDownloading(true)
    const selectedItems = announcements.filter(item => selectedRowKeys.includes(item.code))
    
    for (const item of selectedItems) {
      await downloadPdf(item)
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    setDownloading(false)
    message.success(`已下载 ${selectedItems.length} 个公告`)
  }

  // 公告表格列定义
  const columns = [
    { 
      title: '日期', 
      dataIndex: 'date', 
      width: 100,
      render: (v) => <span style={{ fontSize: 12, color: '#666' }}>{v}</span>
    },
    { 
      title: '公告标题', 
      dataIndex: 'title', 
      ellipsis: true,
      render: (v, record) => (
        <a 
          href={record.pdfUrl}
          target="_blank" 
          rel="noopener noreferrer"
          style={{ fontSize: 13, color: '#333' }}
          onClick={(e) => e.stopPropagation()}
        >
          {v}
        </a>
      )
    },
    { 
      title: '分类', 
      dataIndex: 'category', 
      width: 120,
      render: (v) => v ? <span style={{ fontSize: 12, color: '#1890ff' }}>{v}</span> : '-'
    },
    { 
      title: '操作', 
      width: 80,
      render: (_, record) => (
        <Tooltip title="下载PDF">
          <Button 
            type="link" 
            size="small" 
            icon={<DownloadOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              downloadPdf(record)
            }}
          />
        </Tooltip>
      )
    },
  ]

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
  }

  return (
    <Card 
      title={
        <Space>
          <FileTextOutlined />
          <span>公司公告</span>
        </Space>
      } 
      size="small" 
      style={{ marginBottom: 12 }}
      extra={
        <Space size="small">
          {market === 'a' && selectedRowKeys.length > 0 && (
            <Button 
              type="primary" 
              size="small" 
              icon={<DownloadOutlined />}
              loading={downloading}
              onClick={handleBatchDownload}
            >
              下载选中({selectedRowKeys.length})
            </Button>
          )}
          <Button type="link" size="small" onClick={() => window.open(ths10jqkaUrl, '_blank')}>同花顺</Button>
          <Button type="link" size="small" onClick={() => window.open(exchangeUrl, '_blank')}>{exchangeName}</Button>
        </Space>
      }
    >
      {market === 'a' ? (
        <>
          {onCategoryChange && (
            <div style={{ marginBottom: 12 }}>
              <Radio.Group 
                value={category} 
                onChange={(e) => onCategoryChange(e.target.value)} 
                size="small"
                buttonStyle="solid"
              >
                {announcementCategories.map(opt => (
                  <Radio.Button key={opt.value} value={opt.value}>{opt.label}</Radio.Button>
                ))}
              </Radio.Group>
            </div>
          )}
          <Table
            size="small"
            loading={loading}
            dataSource={announcements}
            columns={columns}
            rowKey="code"
            rowSelection={rowSelection}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: total,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ['10', '20', '50'],
              showTotal: (t) => `共 ${t} 条`,
              onChange: onPaginationChange,
              onShowSizeChange: onPaginationChange,
            }}
          />
        </>
      ) : (
        <div style={{ color: '#666', fontSize: 13, padding: '12px 0' }}>
          港股公告请点击上方链接查看
        </div>
      )}
    </Card>
  )
})

AnnouncementTable.displayName = 'AnnouncementTable'

export default AnnouncementTable
