import { ProLayout } from '@ant-design/pro-components';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

const route = {
  path: '/',
  routes: [
    {
      path: '/stock',
      name: '股票数据',
      icon: 'LineChartOutlined',
      component: './stock',
    },
  ],
};

export default function App() {
  const location = useLocation();
  
  return (
    <ConfigProvider locale={zhCN}>
      <ProLayout
        title="股票系统"
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
