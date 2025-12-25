import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Grid } from 'antd'
import { BarChartOutlined, LineChartOutlined } from '@ant-design/icons'

const { Sider, Content, Header } = Layout
const { useBreakpoint } = Grid

const menuItems = [
  { key: '/range-stats', label: '区间统计', icon: <BarChartOutlined /> },
  { key: '/market-overview', label: '汇率走势', icon: <LineChartOutlined /> },
]

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const screens = useBreakpoint()
  const isMobile = !screens.md

  const currentPath = location.pathname === '/' ? '/range-stats' : location.pathname

  // 移动端布局
  if (isMobile) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ 
          padding: '0 12px', 
          background: '#001529', 
          display: 'flex', 
          alignItems: 'center',
          height: 48,
          lineHeight: '48px'
        }}>
          <div style={{ color: '#fff', fontWeight: 'bold', marginRight: 16, fontSize: 14 }}>
            📈 港股分析
          </div>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[currentPath]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ flex: 1, minWidth: 0, background: 'transparent', borderBottom: 'none' }}
          />
        </Header>
        <Content style={{ padding: 0, background: '#f5f5f5', overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    )
  }

  // 桌面端布局
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: collapsed ? 20 : 18,
          fontWeight: 'bold',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}>
          {collapsed ? '📈' : '港股分析'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[currentPath]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Content style={{ margin: 16, padding: 16, background: '#fff', borderRadius: 8 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
