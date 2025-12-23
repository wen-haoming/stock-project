import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App.jsx'
import RangeStats from './pages/range-stats/index.jsx'
import DetailMobilePage from './pages/range-stats/DetailMobilePage.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<RangeStats />} />
            <Route path="range-stats" element={<RangeStats />} />
          </Route>
          {/* 移动端股票详情页 - 独立路由，全屏显示 */}
          <Route path="/stock/:symbol" element={<DetailMobilePage />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  </StrictMode>,
)
