import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu } from 'antd'
import { BarChartOutlined } from '@ant-design/icons'

const { Sider, Content } = Layout

const menuItems = [
  { key: '/range-stats', label: '区间统计', icon: <BarChartOutlined /> },
]

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  const currentPath = location.pathname === '/' ? '/range-stats' : location.pathname

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
