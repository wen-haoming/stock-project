import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App.jsx'
import RangeStats from './pages/range-stats/index.jsx'
import MarketOverview from './pages/market-overview/index.jsx'
import CommodityPage from './pages/commodity/index.jsx'
import WatchlistPage from './pages/watchlist/index.jsx'
import MarketIndexPage from './pages/market-index/index.jsx'
import DetailMobilePage from './pages/range-stats/DetailMobilePage.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<WatchlistPage />} />
            <Route path="watchlist" element={<WatchlistPage />} />
            <Route path="market-index" element={<MarketIndexPage />} />
            <Route path="range-stats" element={<RangeStats />} />
            <Route path="market-overview" element={<MarketOverview />} />
            <Route path="commodity" element={<CommodityPage />} />
          </Route>
          {/* 移动端股票详情页 - 独立路由，全屏显示 */}
          <Route path="/stock/:symbol" element={<DetailMobilePage />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  </StrictMode>,
)
