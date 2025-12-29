import { memo } from 'react'
import { Card, Empty } from 'antd'

/**
 * 新闻列表组件
 */
const NewsList = memo(({ news }) => (
  <Card title="相关资讯" size="small">
    {news.length > 0 ? (
      <div style={{ maxHeight: 400, overflow: 'auto' }}>
        {news.map((item, index) => (
          <div 
            key={index} 
            style={{ 
              padding: '6px 0', 
              borderBottom: index < news.length - 1 ? '1px solid #f0f0f0' : 'none', 
              cursor: 'pointer' 
            }} 
            onClick={() => window.open(item.url, '_blank')}
          >
            <div style={{ fontSize: 13, color: '#333', lineHeight: 1.4, marginBottom: 2 }}>
              {item.title}
            </div>
            <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#999' }}>
              <span>{item.source}</span>
              <span>{item.date}</span>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <Empty description="暂无相关资讯" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    )}
  </Card>
))

NewsList.displayName = 'NewsList'

export default NewsList
