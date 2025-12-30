// 股票相关类型
export interface Stock {
  symbol: string
  name: string
  market?: string
  price?: number
  change?: number
  changePercent?: number
  volume?: number
  amount?: number
  high?: number
  low?: number
  open?: number
  preClose?: number
  turnover?: number
  pe?: number
  pb?: number
  marketCap?: number
  circulationMarketCap?: number
}

export interface StockInfo extends Stock {
  industry?: string
  concept?: string
  region?: string
  listDate?: string
  totalShares?: number
  circulationShares?: number
  eps?: number
  bps?: number
  roe?: number
}

// K线数据类型
export interface KlineData {
  categoryData: string[]
  values: number[][] // [open, close, low, high]
  volumes: number[][] // [index, volume, direction]
  isTrend?: boolean
  preClose?: number
}

// 分时数据类型
export interface TrendData {
  categoryData: string[]
  values: number[][] // [price, avgPrice]
  volumes: number[][]
  isTrend: true
  preClose: number
}

// 财务数据类型
export interface FinanceData {
  reportDate: string
  period?: string
  revenue?: number | null
  netProfit?: number | null
  grossProfit?: number | null
  grossMargin?: number
  netMargin?: number
  roe?: number | null
  debtRatio?: number
  currentRatio?: number
  quickRatio?: number
  eps?: number | null
  bps?: number
  navps?: number | null
  npm?: number | null
  gpm?: number | null
  dar?: number | null
  netProfitYoy?: number | null
  revenueYoy?: number | null
  grossProfitYoy?: number | null
  [key: string]: string | number | null | undefined
}

// 新闻类型
export interface NewsItem {
  title: string
  url: string
  source: string
  time: string
}

// 公告类型
export interface Announcement {
  title: string
  url: string
  date: string
  type: string
}

// 五档盘口类型
export interface OrderBook {
  askPrices: number[]
  askVolumes: number[]
  bidPrices: number[]
  bidVolumes: number[]
}

// 大宗商品类型
export interface Commodity {
  code: string
  name: string
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  open: number
  preClose: number
  volume?: number
  amount?: number
  unit?: string
}

// API 响应类型
export interface ApiResponse<T> {
  code: number
  data: T
  message?: string
}

// 分页类型
export interface Pagination {
  current: number
  pageSize: number
  total?: number
}

// 主题类型
export interface ThemeConfig {
  algorithm: any
  token: {
    colorPrimary: string
    borderRadius: number
    colorBgContainer: string
    colorText: string
    colorTextSecondary: string
    colorBorder: string
    colorBgElevated: string
  }
  custom: {
    bgColor: string
    headerBg: string
    cardBg: string
  }
}

// ECharts 主题类型
export interface EChartsTheme {
  textStyle: { color: string }
  axisLabel: { color: string }
  axisLine: { lineStyle: { color: string } }
  splitLine: { lineStyle: { color: string } }
  tooltip: {
    backgroundColor: string
    borderColor: string
    textStyle: { color: string }
  }
}
