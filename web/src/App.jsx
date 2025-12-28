import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Grid } from 'antd'
import { BarChartOutlined, LineChartOutlined, GoldOutlined, StarOutlined, StockOutlined } from '@ant-design/icons'

const { Content, Header } = Layout
const { useBreakpoint } = Grid

const menuItems = [
  { key: '/watchlist', label: '自选股', icon: <StarOutlined /> },
  { key: '/market-index', label: '大盘行情', icon: <StockOutlined /> },
  { key: '/range-stats', label: '区间统计', icon: <BarChartOutlined /> },
  { key: '/market-overview', label: '汇率走势', icon: <LineChartOutlined /> },
  { key: '/commodity', label: '大宗商品', icon: <GoldOutlined /> },
]

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const screens = useBreakpoint()
  const isMobile = !screens.md

  const currentPath = location.pathname === '/' ? '/watchlist' : location.pathname

  // 自选股页面需要全高度布局
  const isWatchlist = currentPath === '/watchlist'

  return (
    <Layout style={{ minHeight: '100vh', height: '100vh' }}>
      <Header style={{ 
        padding: '0 10px', 
        background: '#001529', 
        display: 'flex', 
        alignItems: 'center',
        height: 32,
        lineHeight: '32px',
        minHeight: 32,
      }}>
        <div style={{ 
          color: '#fff', 
          fontWeight: 'bold', 
          marginRight: 10, 
          fontSize: 13,
          whiteSpace: 'nowrap'
        }}>
          📈 {isMobile ? '' : '知行数据分析'}
        </div>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[currentPath]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ 
            flex: 1, 
            minWidth: 0, 
            background: 'transparent', 
            borderBottom: 'none',
            fontSize: 12,
            lineHeight: '32px',
          }}
        />
      </Header>
      <Content style={isWatchlist 
        ? { background: '#fff', height: 'calc(100vh - 32px)', overflow: 'hidden' } 
        : { margin: isMobile ? 6 : 10, padding: isMobile ? 6 : 10, background: '#fff', borderRadius: 4, overflow: 'auto' }
      }>
        <Outlet />
      </Content>
    </Layout>
  )
}

export default App
