import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Grid, ConfigProvider, Switch, Tooltip, App as AntdApp } from 'antd'
import { BarChartOutlined, LineChartOutlined, GoldOutlined, StarOutlined, StockOutlined, SearchOutlined, SunOutlined, MoonOutlined, FundOutlined } from '@ant-design/icons'
import zhCN from 'antd/locale/zh_CN'
import { useTheme } from './contexts/ThemeContext'

const { Content, Header } = Layout
const { useBreakpoint } = Grid

const menuItems = [
  { key: '/watchlist', label: '自选股', icon: <StarOutlined /> },
  { key: '/stock-picker', label: '行情选股', icon: <SearchOutlined /> },
  { key: '/market-index', label: '大盘行情', icon: <StockOutlined /> },
  { key: '/range-stats', label: '区间统计', icon: <BarChartOutlined /> },
  { key: '/options', label: '期权涡轮', icon: <FundOutlined /> },
  { key: '/market-overview', label: '汇率走势', icon: <LineChartOutlined /> },
  { key: '/commodity', label: '大宗商品', icon: <GoldOutlined /> },
]

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const { isDark, toggleTheme, theme: currentTheme } = useTheme()

  const currentPath = location.pathname === '/' ? '/watchlist' : location.pathname

  // 自选股页面需要全高度布局
  const isFullHeight = currentPath === '/watchlist' || currentPath === '/stock-picker'

  return (
    <Layout style={{ minHeight: '100vh', height: '100vh' }}>
      <Header style={{ 
        padding: '0 10px', 
        background: currentTheme.custom.headerBg, 
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
        {/* 主题切换按钮 */}
        <Tooltip title={isDark ? '切换亮色主题' : '切换暗色主题'}>
          <Switch
            checked={isDark}
            onChange={toggleTheme}
            checkedChildren={<MoonOutlined />}
            unCheckedChildren={<SunOutlined />}
            style={{ marginLeft: 8 }}
          />
        </Tooltip>
      </Header>
      <Content style={isFullHeight 
        ? { background: currentTheme.custom.bgColor, height: 'calc(100vh - 32px)', overflow: 'hidden' } 
        : { margin: isMobile ? 6 : 10, padding: isMobile ? 6 : 10, background: currentTheme.custom.bgColor, borderRadius: 4, overflow: 'auto' }
      }>
        <Outlet />
      </Content>
    </Layout>
  )
}

function App() {
  const { theme: currentTheme } = useTheme()

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: currentTheme.algorithm,
        token: currentTheme.token,
      }}
    >
      <AntdApp>
        <AppContent />
      </AntdApp>
    </ConfigProvider>
  )
}

export default App
