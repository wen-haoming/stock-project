import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App'
import RangeStats from './pages/range-stats/index'
import MarketOverview from './pages/market-overview/index'
import CommodityPage from './pages/commodity/index'
import WatchlistPage from './pages/watchlist/index'
import MarketIndexPage from './pages/market-index/index'
import StockPickerPage from './pages/stock-picker/index'
import DetailMobilePage from './pages/range-stats/DetailMobilePage'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<WatchlistPage />} />
            <Route path="watchlist" element={<WatchlistPage />} />
            <Route path="stock-picker" element={<StockPickerPage />} />
            <Route path="market-index" element={<MarketIndexPage />} />
            <Route path="range-stats" element={<RangeStats />} />
            <Route path="market-overview" element={<MarketOverview />} />
            <Route path="commodity" element={<CommodityPage />} />
          </Route>
          {/* 移动端股票详情页 - 独立路由，全屏显示 */}
          <Route path="/stock/:symbol" element={<DetailMobilePage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
