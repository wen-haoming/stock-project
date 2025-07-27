import { ProLayout } from '@ant-design/pro-components';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

const route = {
  path: '/',
  routes: [
    {
      path: '/frontend',
      name: '前端开发',
      icon: 'CodeOutlined',
      component: './prompt',
    },
    {
      path: '/backend',
      name: '后端开发',
      icon: 'ToolOutlined',
      component: './prompt',
    },
    {
      path: '/ui-design',
      name: 'UI 设计',
      icon: 'EyeOutlined',
      component: './prompt',
    },
    {
      path: '/programming-rules',
      name: '编程规范',
      icon: 'BugOutlined',
      component: './prompt',
    },
  ],
};

export default function App() {
  const location = useLocation();
  
  return (
    <ConfigProvider locale={zhCN}>
      <ProLayout
        title="Prompt 模板库"
        location={location}
        route={route}
        style={{width:'100vw',height:'100vh'}}
        contentStyle={{padding:0}}
        menuItemRender={(item, dom) => (
          <Link to={item.path || '/'}>{dom}</Link>
        )}
      >
        <div style={{flex:1,overflow:'auto'}}>
          <Outlet />
        </div>
      </ProLayout>
    </ConfigProvider>
  );
}
