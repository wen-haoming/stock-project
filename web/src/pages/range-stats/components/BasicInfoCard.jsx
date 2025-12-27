import { memo } from 'react'
import { Card, Row, Col, Statistic } from 'antd'

/**
 * 基础信息卡片
 */
const BasicInfoCard = memo(({ stock, isMobile }) => (
  <Card title="基础信息" size="small" style={{ marginBottom: 12 }}>
    <Row gutter={[12, 12]}>
      <Col span={8}>
        <Statistic 
          title="最新价" 
          value={stock.latestPrice} 
          precision={2} 
          valueStyle={{ color: stock.changePct >= 0 ? '#ec5a5a' : '#47b262', fontSize: isMobile ? 16 : 20 }} 
        />
      </Col>
      <Col span={8}>
        <Statistic 
          title="区间涨幅" 
          value={stock.changePct} 
          precision={2} 
          suffix="%" 
          prefix={stock.changePct >= 0 ? '+' : ''} 
          valueStyle={{ color: stock.changePct >= 0 ? '#ec5a5a' : '#47b262', fontSize: isMobile ? 16 : 20 }} 
        />
      </Col>
      <Col span={8}>
        <Statistic 
          title="市值(亿)" 
          value={stock.totalMarketCap ? (stock.totalMarketCap / 100000000).toFixed(0) : '-'} 
          valueStyle={{ fontSize: isMobile ? 16 : 20 }} 
        />
      </Col>
      <Col span={8}>
        <Statistic 
          title="行业" 
          value={stock.industry || '-'} 
          valueStyle={{ fontSize: isMobile ? 13 : 14 }} 
        />
      </Col>
      <Col span={8}>
        <Statistic 
          title="市盈率" 
          value={stock.peRatio?.toFixed(2) || '-'} 
          valueStyle={{ fontSize: isMobile ? 16 : 20 }} 
        />
      </Col>
      <Col span={8}>
        <Statistic 
          title="市净率" 
          value={stock.pbRatio?.toFixed(2) || '-'} 
          valueStyle={{ fontSize: isMobile ? 16 : 20 }} 
        />
      </Col>
    </Row>
  </Card>
))

BasicInfoCard.displayName = 'BasicInfoCard'

export default BasicInfoCard
