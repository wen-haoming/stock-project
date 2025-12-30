/**
 * 财务相关常量配置
 */

// 报告类型选项
export const reportTypeOptions = [
  { label: '全部', value: '' },
  { label: '中报', value: '2' },
  { label: '年报', value: '4' },
]

// 财务指标配置（含解释、公式、例子）
export const financeMetrics = [
  { key: 'netProfit', label: '归母净利润', unit: '亿', yoyKey: 'netProfitYoy', tip: '解释：扣除所有成本费用后，真正属于股东的利润\n公式：营业收入 - 成本 - 费用 - 税金\n例子：收入100亿，各项支出80亿，归母净利润=20亿' },
  { key: 'revenue', label: '营业收入', unit: '亿', yoyKey: 'revenueYoy', tip: '解释：公司主营业务获得的全部收入，反映经营规模\n公式：销售数量 × 单价\n例子：卖出1000万部手机，每部3000元，营业收入=300亿' },
  { key: 'grossProfit', label: '毛利润', unit: '亿', yoyKey: 'grossProfitYoy', tip: '解释：扣除直接生产成本后的利润，体现产品盈利能力\n公式：营业收入 - 营业成本\n例子：收入100亿，生产成本60亿，毛利润=40亿' },
  { key: 'eps', label: '每股收益', unit: '元', yoyKey: null, tip: '解释：每一股能赚多少钱，衡量股票价值的核心指标\n公式：净利润 ÷ 总股本\n例子：净利润10亿，股本5亿股，EPS=2元/股' },
  { key: 'navps', label: '每股净资产', unit: '元', yoyKey: null, tip: '解释：每一股对应的账面价值，可判断股价是否被低估\n公式：净资产 ÷ 总股本\n例子：净资产50亿，股本5亿股，每股净资产=10元' },
  { key: 'npm', label: '净利率', unit: '%', yoyKey: null, tip: '解释：每100元收入能赚多少净利润，反映综合盈利能力\n公式：净利润 ÷ 营业收入 × 100%\n例子：收入100亿，净利润20亿，净利率=20%' },
  { key: 'gpm', label: '毛利率', unit: '%', yoyKey: null, tip: '解释：每100元收入扣除成本后剩多少，反映产品定价权\n公式：毛利润 ÷ 营业收入 × 100%\n例子：收入100亿，毛利润40亿，毛利率=40%' },
  { key: 'roe', label: 'ROE', unit: '%', yoyKey: null, tip: '解释：股东投入的钱能产生多少回报，巴菲特最看重的指标\n公式：净利润 ÷ 净资产 × 100%\n例子：净资产100亿，净利润15亿，ROE=15%' },
  { key: 'dar', label: '资产负债率', unit: '%', yoyKey: null, tip: '解释：公司负债占总资产的比例，衡量财务风险\n公式：总负债 ÷ 总资产 × 100%\n例子：总资产100亿，负债50亿，资产负债率=50%' },
]

// 简化版财务指标（移动端）
export const financeMetricsSimple = [
  { key: 'netProfit', label: '净利润', unit: '亿' },
  { key: 'revenue', label: '营收', unit: '亿' },
  { key: 'grossProfit', label: '毛利', unit: '亿' },
  { key: 'npm', label: '净利率', unit: '%' },
  { key: 'gpm', label: '毛利率', unit: '%' },
  { key: 'roe', label: 'ROE', unit: '%' },
]

// 公告分类选项
export const announcementCategories = [
  { label: '全部', value: '0' },
  { label: '业绩报告', value: '1' },
  { label: '融资公告', value: '2' },
  { label: '风险提示', value: '3' },
  { label: '资产重组', value: '4' },
  { label: '信息变更', value: '5' },
]

// 财务表格列定义
export const financeTableColumns = [
  { title: '报告期', dataIndex: 'period', width: 90, fixed: 'left' },
  { title: '归母净利润(亿)', dataIndex: 'netProfit', width: 110, render: (v) => <span style={{ color: v >= 0 ? '#1890ff' : '#47b262' }}>{v?.toFixed(2)}</span> },
  { title: '同比', dataIndex: 'netProfitYoy', width: 80, render: (v) => v !== null ? <span style={{ color: v >= 0 ? '#ec5a5a' : '#47b262' }}>{v >= 0 ? '+' : ''}{v?.toFixed(1)}%</span> : '-' },
  { title: '营业收入(亿)', dataIndex: 'revenue', width: 100, render: (v) => v?.toFixed(2) },
  { title: '收入同比', dataIndex: 'revenueYoy', width: 80, render: (v) => v !== null ? <span style={{ color: v >= 0 ? '#ec5a5a' : '#47b262' }}>{v >= 0 ? '+' : ''}{v?.toFixed(1)}%</span> : '-' },
  { title: '每股收益', dataIndex: 'eps', width: 80, render: (v) => v?.toFixed(3) },
  { title: 'ROE', dataIndex: 'roe', width: 70, render: (v) => v ? v.toFixed(1) + '%' : '-' },
]
