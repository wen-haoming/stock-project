import { useState, useEffect, useRef, memo, useCallback } from 'react'
import { Row, Col, Spin, Radio, Grid, Button, Tooltip, Segmented, Drawer, Empty, List, Tag, message } from 'antd'
import { RiseOutlined, FallOutlined, ReloadOutlined, InfoCircleOutlined, LinkOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import * as echarts from 'echarts'
import axios from 'axios'
import dayjs from 'dayjs'

const { useBreakpoint } = Grid

// 影响分析逻辑 - 详细版
const getImpactAnalysis = (commodity, changePct, latestPrice) => {
  const isUp = changePct > 0
  const isStrong = Math.abs(changePct) > 10
  const isMild = Math.abs(changePct) < 3
  
  const impacts = {
    // ========== 贵金属 ==========
    '黄金': {
      desc: '全球最重要的避险资产，与美元负相关',
      aStock: isUp 
        ? { trend: '利好', stocks: '山东黄金、紫金矿业、中金黄金、赤峰黄金、银泰黄金', detail: '金价上涨直接提升黄金股业绩，避险情绪升温利好防御板块' }
        : { trend: '利空', stocks: '黄金股承压，资金流向成长股', detail: '风险偏好回升，避险资产吸引力下降' },
      hkStock: isUp
        ? { trend: '利好', stocks: '招金矿业、中国黄金国际、灵宝黄金', detail: '港股黄金股跟涨，避险资金流入' }
        : { trend: '中性', stocks: '黄金股回调', detail: '风险偏好改善，科技股更受青睐' },
      usStock: isUp
        ? { trend: '利空', stocks: 'SPDR黄金ETF涨，纳斯达克承压', detail: '避险情绪升温，高估值科技股面临抛压' }
        : { trend: '利好', stocks: '科技股、成长股受益', detail: '风险偏好回升，资金流向权益资产' },
    },
    '白银': {
      desc: '兼具避险和工业双重属性，光伏银浆需求大',
      aStock: isUp
        ? { trend: '利好', stocks: '盛达资源、兴业矿业、银泰黄金、通威股份(银浆)', detail: '白银涨价利好矿业股，光伏银浆成本上升但需求旺盛' }
        : { trend: '利空', stocks: '白银概念股回调', detail: '贵金属板块整体承压' },
      hkStock: isUp
        ? { trend: '利好', stocks: '贵金属股走强', detail: '跟随国际银价上涨' }
        : { trend: '中性', stocks: '影响有限', detail: '港股白银标的较少' },
      usStock: isUp
        ? { trend: '中性', stocks: 'SLV白银ETF', detail: '对大盘影响有限，主要影响贵金属ETF' }
        : { trend: '中性', stocks: '影响有限', detail: '白银对美股整体影响较小' },
    },
    '铂金': {
      desc: '汽车催化剂、燃料电池核心材料',
      aStock: isUp
        ? { trend: '利好', stocks: '贵研铂业、西部材料', detail: '铂金涨价利好相关矿业和加工企业' }
        : { trend: '利空', stocks: '铂金概念股承压', detail: '需求预期走弱' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股铂金标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: 'PPLT铂金ETF', detail: '对大盘影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '钯金': {
      desc: '汽油车催化剂主要材料',
      aStock: isUp
        ? { trend: '利好', stocks: '贵研铂业', detail: '钯金涨价利好相关企业' }
        : { trend: '利空', stocks: '相关概念股承压', detail: '汽车行业需求预期走弱' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股钯金标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: 'PALL钯金ETF', detail: '对大盘影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    // ========== 能源化工 ==========
    '原油': {
      desc: '全球经济晴雨表，影响通胀和货币政策',
      aStock: isUp
        ? { trend: '利好', stocks: '中国石油、中国石化、中海油服、海油工程、中曼石油', detail: '油价上涨直接提升三桶油业绩，油服板块订单增加' }
        : { trend: '分化', stocks: '石油股承压，航空(国航、南航)、化工下游受益', detail: '低油价降低航空燃油成本，化工原料成本下降' },
      hkStock: isUp
        ? { trend: '利好', stocks: '中海油、中石油、中石化', detail: '三桶油H股跟涨，但航空股承压' }
        : { trend: '分化', stocks: '能源股弱，国泰航空、东方航空H股受益', detail: '燃油成本下降利好航空股' },
      usStock: isUp
        ? { trend: '分化', stocks: '埃克森美孚、雪佛龙涨；航空股、消费股承压', detail: '高油价引发通胀担忧，美联储加息预期升温' }
        : { trend: '利好', stocks: '科技股、消费股受益，能源股承压', detail: '通胀压力缓解，利好成长股估值' },
    },
    '天然气': {
      desc: '清洁能源，冬季取暖需求旺盛',
      aStock: isUp
        ? { trend: '利好', stocks: '新奥股份、广汇能源、蓝焰控股、九丰能源', detail: '气价上涨利好上游气源企业' }
        : { trend: '分化', stocks: '气源股承压，城燃(深圳燃气、新奥能源)成本改善', detail: '低气价利好下游城市燃气公司' },
      hkStock: isUp
        ? { trend: '利好', stocks: '昆仑能源、新奥能源', detail: '港股燃气股受益' }
        : { trend: '分化', stocks: '上游承压，中游城燃受益', detail: '采购成本下降' },
      usStock: isUp
        ? { trend: '分化', stocks: 'Cheniere Energy涨，公用事业股承压', detail: 'LNG出口商受益，但推高电力成本' }
        : { trend: '利好', stocks: '公用事业股、制造业受益', detail: '能源成本下降' },
    },
    '动力煤': {
      desc: '火电核心燃料，影响电力成本',
      aStock: isUp
        ? { trend: '利好', stocks: '中国神华、陕西煤业、兖矿能源、中煤能源', detail: '煤价上涨直接提升煤炭股业绩' }
        : { trend: '分化', stocks: '煤炭股承压，火电(华能国际、国电电力)成本改善', detail: '低煤价利好火电企业利润修复' },
      hkStock: isUp
        ? { trend: '利好', stocks: '中国神华H、兖矿能源H、中煤能源H', detail: '港股煤炭股跟涨' }
        : { trend: '分化', stocks: '煤炭股弱，华能国际H受益', detail: '发电成本下降' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '美国煤炭占比已大幅下降' }
        : { trend: '中性', stocks: '影响有限', detail: '美国能源结构已转型' },
    },
    '焦煤': {
      desc: '炼钢必需品，钢铁产业链上游',
      aStock: isUp
        ? { trend: '利好', stocks: '平煤股份、淮北矿业、山西焦煤、潞安环能', detail: '焦煤涨价利好焦煤企业，但钢铁成本上升' }
        : { trend: '分化', stocks: '焦煤股承压，钢铁(宝钢、鞍钢)成本改善', detail: '低焦煤价利好钢铁企业利润' },
      hkStock: isUp
        ? { trend: '利好', stocks: '中国旭阳集团', detail: '焦化企业受益' }
        : { trend: '中性', stocks: '影响有限', detail: '港股焦煤标的较少' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '美国钢铁以电炉为主' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '焦炭': {
      desc: '高炉炼铁还原剂',
      aStock: isUp
        ? { trend: '利好', stocks: '美锦能源、山西焦化、开滦股份', detail: '焦炭涨价利好焦化企业' }
        : { trend: '分化', stocks: '焦化股承压，钢铁股成本改善', detail: '钢铁企业原料成本下降' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股焦炭标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '沥青': {
      desc: '道路建设核心材料',
      aStock: isUp
        ? { trend: '利好', stocks: '宝利国际、国创高新', detail: '沥青涨价利好生产企业，但基建成本上升' }
        : { trend: '分化', stocks: '沥青股承压，基建股成本改善', detail: '道路建设成本下降' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股沥青标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '燃油': {
      desc: '船舶燃料',
      aStock: isUp
        ? { trend: '分化', stocks: '炼化企业受益，航运(中远海控)成本上升', detail: '燃油涨价利好炼厂，但航运成本增加' }
        : { trend: '分化', stocks: '炼化承压，航运股成本改善', detail: '低燃油价利好航运企业' },
      hkStock: isUp
        ? { trend: '分化', stocks: '中远海控H成本承压', detail: '航运燃油成本上升' }
        : { trend: '利好', stocks: '航运股受益', detail: '燃油成本下降' },
      usStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '对美股影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    'PTA': {
      desc: '聚酯产业链核心，涤纶原料',
      aStock: isUp
        ? { trend: '利好', stocks: '恒力石化、荣盛石化、桐昆股份、恒逸石化', detail: 'PTA涨价利好聚酯龙头' }
        : { trend: '利空', stocks: '聚酯股承压', detail: 'PTA价格下跌压缩利润' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股PTA标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '甲醇': {
      desc: '基础化工原料，煤化工产品',
      aStock: isUp
        ? { trend: '利好', stocks: '远兴能源、华鲁恒升、鲁西化工', detail: '甲醇涨价利好煤化工企业' }
        : { trend: '利空', stocks: '煤化工股承压', detail: '产品价格下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股甲醇标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '乙二醇': {
      desc: '聚酯原料，与PTA配套',
      aStock: isUp
        ? { trend: '利好', stocks: '卫星化学、华鲁恒升', detail: '乙二醇涨价利好生产企业' }
        : { trend: '利空', stocks: '相关化工股承压', detail: '产品价格下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '聚丙烯': {
      desc: '通用塑料，包装材料',
      aStock: isUp
        ? { trend: '利好', stocks: '卫星化学、东华能源、宝丰能源', detail: 'PP涨价利好生产企业' }
        : { trend: '分化', stocks: '生产商承压，塑料加工企业成本改善', detail: '原料成本下降' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '塑料': {
      desc: 'LLDPE，薄膜包装材料',
      aStock: isUp
        ? { trend: '利好', stocks: '中国石化、卫星化学', detail: '塑料涨价利好生产企业' }
        : { trend: '分化', stocks: '生产商承压，下游加工企业受益', detail: '原料成本下降' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '橡胶': {
      desc: '轮胎核心原料',
      aStock: isUp
        ? { trend: '分化', stocks: '海南橡胶涨，玲珑轮胎、赛轮轮胎成本承压', detail: '橡胶涨价利好种植企业，轮胎企业成本上升' }
        : { trend: '分化', stocks: '橡胶股弱，轮胎股成本改善', detail: '轮胎企业原料成本下降' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股橡胶标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '固特异等轮胎股成本承压', detail: '原料成本上升' }
        : { trend: '利好', stocks: '轮胎股成本改善', detail: '原料成本下降' },
    },
    '纯碱': {
      desc: '玻璃、光伏玻璃原料',
      aStock: isUp
        ? { trend: '利好', stocks: '远兴能源、山东海化、三友化工', detail: '纯碱涨价利好生产企业' }
        : { trend: '分化', stocks: '纯碱股承压，玻璃(信义玻璃)成本改善', detail: '玻璃企业原料成本下降' },
      hkStock: isUp
        ? { trend: '分化', stocks: '信义玻璃成本承压', detail: '原料成本上升' }
        : { trend: '利好', stocks: '信义玻璃成本改善', detail: '原料成本下降' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '玻璃': {
      desc: '房地产、光伏产业链',
      aStock: isUp
        ? { trend: '利好', stocks: '旗滨集团、南玻A、信义光能', detail: '玻璃涨价利好玻璃企业' }
        : { trend: '利空', stocks: '玻璃股承压', detail: '需求疲软，价格下跌' },
      hkStock: isUp
        ? { trend: '利好', stocks: '信义玻璃、信义光能', detail: '玻璃涨价利好相关企业' }
        : { trend: '利空', stocks: '玻璃股承压', detail: '价格下跌' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '尿素': {
      desc: '最重要的氮肥',
      aStock: isUp
        ? { trend: '利好', stocks: '华鲁恒升、湖北宜化、阳煤化工', detail: '尿素涨价利好化肥企业' }
        : { trend: '分化', stocks: '化肥股承压，种植业成本改善', detail: '农业种植成本下降' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股尿素标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '利好', stocks: 'CF Industries、Nutrien', detail: '化肥股受益' }
        : { trend: '利空', stocks: '化肥股承压', detail: '价格下跌' },
    },
    // ========== 有色金属 ==========
    '铜': {
      desc: '铜博士，全球经济先行指标',
      aStock: isUp
        ? { trend: '利好', stocks: '紫金矿业、江西铜业、铜陵有色、云南铜业、西部矿业', detail: '铜价上涨利好铜矿和冶炼企业，反映经济复苏预期' }
        : { trend: '利空', stocks: '有色板块承压，新能源(铜箔)成本改善', detail: '经济放缓担忧，但利好铜箔企业成本' },
      hkStock: isUp
        ? { trend: '利好', stocks: '紫金矿业H、江西铜业H、中国有色矿业', detail: '港股有色股跟涨，经济预期改善' }
        : { trend: '利空', stocks: '有色股承压', detail: '经济衰退担忧' },
      usStock: isUp
        ? { trend: '利好', stocks: 'Freeport-McMoRan、Southern Copper', detail: '铜矿股受益，反映全球经济向好' }
        : { trend: '利空', stocks: '矿业股承压', detail: '经济衰退担忧' },
    },
    '铝': {
      desc: '电解铝，高耗能产业',
      aStock: isUp
        ? { trend: '利好', stocks: '中国铝业、云铝股份、天山铝业、神火股份', detail: '铝价上涨利好电解铝企业' }
        : { trend: '利空', stocks: '电解铝股承压', detail: '铝价下跌压缩利润' },
      hkStock: isUp
        ? { trend: '利好', stocks: '中国铝业H、中国宏桥', detail: '港股铝业股受益' }
        : { trend: '利空', stocks: '铝业股承压', detail: '价格下跌' },
      usStock: isUp
        ? { trend: '利好', stocks: 'Alcoa', detail: '铝业股受益' }
        : { trend: '利空', stocks: '铝业股承压', detail: '价格下跌' },
    },
    '锌': {
      desc: '镀锌钢材原料',
      aStock: isUp
        ? { trend: '利好', stocks: '中金岭南、驰宏锌锗、西藏珠峰', detail: '锌价上涨利好锌矿企业' }
        : { trend: '利空', stocks: '锌业股承压', detail: '价格下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股锌业标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '镍': {
      desc: '不锈钢、三元电池材料',
      aStock: isUp
        ? { trend: '利好', stocks: '华友钴业、盛屯矿业、格林美', detail: '镍价上涨利好镍矿和加工企业' }
        : { trend: '分化', stocks: '镍矿股承压，电池厂成本改善', detail: '三元电池原料成本下降' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股镍业标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '锡': {
      desc: '焊料、半导体封装材料',
      aStock: isUp
        ? { trend: '利好', stocks: '锡业股份、华锡有色', detail: '锡价上涨利好锡矿企业' }
        : { trend: '利空', stocks: '锡业股承压', detail: '价格下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股锡业标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '铅': {
      desc: '铅酸电池原料',
      aStock: isUp
        ? { trend: '利好', stocks: '豫光金铅、驰宏锌锗', detail: '铅价上涨利好铅矿企业' }
        : { trend: '分化', stocks: '铅矿股承压，电池企业成本改善', detail: '铅酸电池成本下降' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股铅业标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '碳酸锂': {
      desc: '新能源核心材料，锂电池正极',
      aStock: isUp
        ? { trend: '利好', stocks: '天齐锂业、赣锋锂业、盐湖股份、融捷股份', detail: '锂价上涨利好锂矿企业' }
        : { trend: '分化', stocks: '锂矿股承压，宁德时代、比亚迪成本改善', detail: '电池厂原料成本下降利好' },
      hkStock: isUp
        ? { trend: '利好', stocks: '赣锋锂业H、天齐锂业H', detail: '港股锂业股受益' }
        : { trend: '分化', stocks: '锂矿弱，比亚迪H成本改善', detail: '整车厂成本下降' },
      usStock: isUp
        ? { trend: '分化', stocks: 'Albemarle涨，特斯拉成本承压', detail: '锂矿股强，但新能源车企成本上升' }
        : { trend: '利好', stocks: '特斯拉、Rivian成本改善', detail: '电池成本下降利好新能源车企' },
    },
    '工业硅': {
      desc: '光伏、有机硅原料',
      aStock: isUp
        ? { trend: '利好', stocks: '合盛硅业、新安股份', detail: '工业硅涨价利好生产企业' }
        : { trend: '分化', stocks: '硅料股承压，光伏组件成本改善', detail: '光伏产业链成本下降' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股工业硅标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    // ========== 黑色系 ==========
    '螺纹钢': {
      desc: '房地产、基建晴雨表',
      aStock: isUp
        ? { trend: '利好', stocks: '宝钢股份、鞍钢股份、华菱钢铁、方大特钢', detail: '钢价上涨利好钢铁股，反映基建地产需求回暖' }
        : { trend: '利空', stocks: '钢铁板块承压', detail: '需求疲软信号，地产基建预期走弱' },
      hkStock: isUp
        ? { trend: '利好', stocks: '鞍钢股份H、马钢股份H，内房股情绪改善', detail: '钢价上涨反映地产需求预期改善' }
        : { trend: '利空', stocks: '钢铁股、内房股承压', detail: '需求疲软' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '中国钢价对美股影响较小' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '热轧卷板': {
      desc: '汽车、家电用钢',
      aStock: isUp
        ? { trend: '利好', stocks: '宝钢股份、首钢股份', detail: '热卷涨价利好钢铁企业' }
        : { trend: '利空', stocks: '钢铁股承压', detail: '需求疲软' },
      hkStock: isUp
        ? { trend: '利好', stocks: '鞍钢股份H', detail: '钢铁股受益' }
        : { trend: '利空', stocks: '钢铁股承压', detail: '价格下跌' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '铁矿石': {
      desc: '钢铁上游，中国需求主导',
      aStock: isUp
        ? { trend: '分化', stocks: '海南矿业受益，钢铁股成本承压', detail: '铁矿涨价利好矿业股，但钢铁企业成本上升' }
        : { trend: '分化', stocks: '矿业股承压，钢铁股成本改善', detail: '钢铁企业原料成本下降' },
      hkStock: isUp
        ? { trend: '分化', stocks: '钢铁股成本承压', detail: '原料成本上升' }
        : { trend: '利好', stocks: '钢铁股成本改善', detail: '原料成本下降' },
      usStock: isUp
        ? { trend: '利好', stocks: 'Vale、Rio Tinto、BHP', detail: '国际矿业巨头受益' }
        : { trend: '利空', stocks: '矿业股承压', detail: '价格下跌' },
    },
    '锰硅': {
      desc: '钢铁脱氧剂',
      aStock: isUp
        ? { trend: '利好', stocks: '鄂尔多斯、宁夏能源', detail: '锰硅涨价利好生产企业' }
        : { trend: '利空', stocks: '锰硅股承压', detail: '价格下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '硅铁': {
      desc: '钢铁合金剂',
      aStock: isUp
        ? { trend: '利好', stocks: '鄂尔多斯', detail: '硅铁涨价利好生产企业' }
        : { trend: '利空', stocks: '相关股票承压', detail: '价格下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    // ========== 农产品 ==========
    '大豆': {
      desc: '农产品龙头，影响食品通胀',
      aStock: isUp
        ? { trend: '利好', stocks: '北大荒、苏垦农发、金健米业', detail: '大豆涨价利好种植企业' }
        : { trend: '分化', stocks: '种植股承压，压榨(道道全)成本改善', detail: '油脂加工成本下降' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股大豆标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '利好', stocks: 'Archer-Daniels-Midland、Bunge', detail: '农业股受益' }
        : { trend: '利空', stocks: '农业股承压', detail: '价格下跌' },
    },
    '玉米': {
      desc: '饲料原料，影响养殖成本',
      aStock: isUp
        ? { trend: '分化', stocks: '北大荒涨，温氏股份、牧原股份成本承压', detail: '玉米涨价利好种植，但养殖成本上升' }
        : { trend: '分化', stocks: '种植股弱，养殖股成本改善', detail: '饲料成本下降利好养殖企业' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股玉米标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '利好', stocks: 'ADM、Bunge', detail: '农业股受益' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '豆粕': {
      desc: '饲料蛋白主要来源',
      aStock: isUp
        ? { trend: '分化', stocks: '道道全受益，养殖股成本承压', detail: '豆粕涨价利好压榨企业，但养殖成本上升' }
        : { trend: '分化', stocks: '压榨股弱，温氏、牧原成本改善', detail: '养殖企业饲料成本下降' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股豆粕标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '对美股影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '豆油': {
      desc: '食用油主要品种',
      aStock: isUp
        ? { trend: '利好', stocks: '道道全、金龙鱼、西王食品', detail: '豆油涨价利好油脂企业' }
        : { trend: '利空', stocks: '油脂股承压', detail: '价格下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股豆油标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '对美股影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '棕榈油': {
      desc: '食用油、生物柴油原料',
      aStock: isUp
        ? { trend: '利好', stocks: '道道全、金龙鱼', detail: '棕榈油涨价利好油脂企业' }
        : { trend: '利空', stocks: '油脂股承压', detail: '价格下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股棕榈油标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '对美股影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '菜油': {
      desc: '国产食用油',
      aStock: isUp
        ? { trend: '利好', stocks: '道道全、金龙鱼', detail: '菜油涨价利好油脂企业' }
        : { trend: '利空', stocks: '油脂股承压', detail: '价格下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股菜油标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '对美股影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '菜粕': {
      desc: '水产饲料蛋白',
      aStock: isUp
        ? { trend: '分化', stocks: '压榨企业受益，水产养殖成本承压', detail: '菜粕涨价影响水产饲料成本' }
        : { trend: '分化', stocks: '压榨股弱，水产养殖成本改善', detail: '饲料成本下降' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股菜粕标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '对美股影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '生猪': {
      desc: 'CPI重要组成，猪周期指标',
      aStock: isUp
        ? { trend: '利好', stocks: '牧原股份、温氏股份、新希望、正邦科技', detail: '猪价上涨直接提升养殖企业利润' }
        : { trend: '利空', stocks: '养殖股承压', detail: '猪价下跌压缩养殖利润' },
      hkStock: isUp
        ? { trend: '利好', stocks: '万洲国际', detail: '猪价上涨利好养殖屠宰企业' }
        : { trend: '利空', stocks: '养殖股承压', detail: '猪价下跌' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '中国猪价对美股影响较小' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '鸡蛋': {
      desc: '禽蛋价格指标',
      aStock: isUp
        ? { trend: '利好', stocks: '圣农发展、民和股份', detail: '蛋价上涨利好养殖企业' }
        : { trend: '利空', stocks: '养殖股承压', detail: '蛋价下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股鸡蛋标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '棉花': {
      desc: '纺织服装原料',
      aStock: isUp
        ? { trend: '分化', stocks: '新农开发涨，鲁泰A、华孚时尚成本承压', detail: '棉价涨利好种植，纺织成本上升' }
        : { trend: '分化', stocks: '种植股弱，纺织服装成本改善', detail: '纺织企业原料成本下降' },
      hkStock: isUp
        ? { trend: '分化', stocks: '申洲国际成本承压', detail: '原料成本上升' }
        : { trend: '利好', stocks: '申洲国际成本改善', detail: '原料成本下降' },
      usStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '对美股影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '白糖': {
      desc: '食品饮料原料',
      aStock: isUp
        ? { trend: '利好', stocks: '中粮糖业、南宁糖业、粤桂股份', detail: '糖价上涨利好糖业企业' }
        : { trend: '利空', stocks: '糖业股承压', detail: '糖价下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股白糖标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '对美股影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '苹果': {
      desc: '鲜果价格指标',
      aStock: isUp
        ? { trend: '利好', stocks: '朗源股份', detail: '苹果涨价利好相关企业' }
        : { trend: '利空', stocks: '相关股票承压', detail: '价格下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股苹果标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '红枣': {
      desc: '新疆特色农产品',
      aStock: isUp
        ? { trend: '利好', stocks: '好想你', detail: '红枣涨价利好相关企业' }
        : { trend: '利空', stocks: '相关股票承压', detail: '价格下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股红枣标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    '花生': {
      desc: '油料作物',
      aStock: isUp
        ? { trend: '利好', stocks: '道道全、金龙鱼', detail: '花生涨价利好油脂企业' }
        : { trend: '利空', stocks: '油脂股承压', detail: '价格下跌' },
      hkStock: isUp
        ? { trend: '中性', stocks: '影响有限', detail: '港股花生标的较少' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
      usStock: isUp
        ? { trend: '中性', stocks: '对美股影响有限', detail: '影响有限' }
        : { trend: '中性', stocks: '影响有限', detail: '影响有限' },
    },
    // ========== 金融板块 ==========
    '10年国债': {
      desc: '无风险利率锚，影响股市估值',
      aStock: isUp
        ? { trend: '利空', stocks: '成长股(宁德、隆基)估值承压，银行股受益', detail: '国债收益率上行压制高估值股票，但利好银行息差' }
        : { trend: '利好', stocks: '成长股估值修复，科技、新能源受益', detail: '无风险利率下行利好高估值成长股' },
      hkStock: isUp
        ? { trend: '利空', stocks: '科技股承压，汇丰、渣打受益', detail: '利率上行利好银行息差' }
        : { trend: '利好', stocks: '科技股受益', detail: '利率下行利好成长股估值' },
      usStock: isUp
        ? { trend: '利空', stocks: '纳斯达克承压，银行股(摩根、高盛)受益', detail: '美债收益率上行压制科技股估值' }
        : { trend: '利好', stocks: '科技股(苹果、微软、英伟达)受益', detail: '利率下行利好成长股' },
    },
    '2年国债': {
      desc: '短期利率预期，反映货币政策',
      aStock: isUp
        ? { trend: '利空', stocks: '流动性收紧预期，成长股承压', detail: '短端利率上行反映货币政策收紧' }
        : { trend: '利好', stocks: '流动性宽松预期，成长股受益', detail: '短端利率下行反映货币政策宽松' },
      hkStock: isUp
        ? { trend: '利空', stocks: '科技股承压', detail: '流动性收紧' }
        : { trend: '利好', stocks: '科技股受益', detail: '流动性宽松' },
      usStock: isUp
        ? { trend: '利空', stocks: '科技股承压', detail: '加息预期升温' }
        : { trend: '利好', stocks: '科技股受益', detail: '降息预期升温' },
    },
    '5年国债': {
      desc: '中期利率指标',
      aStock: isUp
        ? { trend: '利空', stocks: '成长股估值承压', detail: '中期利率上行压制估值' }
        : { trend: '利好', stocks: '成长股受益', detail: '中期利率下行利好估值' },
      hkStock: isUp
        ? { trend: '利空', stocks: '科技股承压', detail: '利率上行' }
        : { trend: '利好', stocks: '科技股受益', detail: '利率下行' },
      usStock: isUp
        ? { trend: '利空', stocks: '科技股承压', detail: '利率上行' }
        : { trend: '利好', stocks: '科技股受益', detail: '利率下行' },
    },
    '30年国债': {
      desc: '长期利率锚，反映经济长期预期',
      aStock: isUp
        ? { trend: '利空', stocks: '长久期资产承压，保险股受益', detail: '长端利率上行利好保险投资收益' }
        : { trend: '分化', stocks: '成长股受益，保险股承压', detail: '长端利率下行压制保险投资收益' },
      hkStock: isUp
        ? { trend: '分化', stocks: '保险股(中国平安H)受益，科技股承压', detail: '长端利率上行' }
        : { trend: '分化', stocks: '科技股受益，保险股承压', detail: '长端利率下行' },
      usStock: isUp
        ? { trend: '利空', stocks: '长久期资产承压', detail: '长端利率上行' }
        : { trend: '利好', stocks: '成长股受益', detail: '长端利率下行' },
    },
    '美国10年国债': {
      desc: '全球资产定价锚',
      aStock: isUp
        ? { trend: '利空', stocks: '外资流出压力，成长股承压', detail: '美债收益率上行吸引资金回流美国' }
        : { trend: '利好', stocks: '外资流入预期，北向资金加仓', detail: '美债收益率下行利好新兴市场' },
      hkStock: isUp
        ? { trend: '利空', stocks: '科技股(腾讯、阿里)承压', detail: '美债收益率上行压制港股估值' }
        : { trend: '利好', stocks: '科技股受益，恒生科技反弹', detail: '美债收益率下行利好港股' },
      usStock: isUp
        ? { trend: '利空', stocks: '纳斯达克承压，银行股受益', detail: '美债收益率上行压制科技股' }
        : { trend: '利好', stocks: '科技股(苹果、英伟达、特斯拉)受益', detail: '美债收益率下行利好成长股' },
    },
    '美国2年国债': {
      desc: '美联储政策预期指标',
      aStock: isUp
        ? { trend: '利空', stocks: '加息预期升温，外资流出', detail: '短端利率上行反映美联储鹰派' }
        : { trend: '利好', stocks: '降息预期升温，外资流入', detail: '短端利率下行反映美联储鸽派' },
      hkStock: isUp
        ? { trend: '利空', stocks: '港股承压', detail: '美联储鹰派预期' }
        : { trend: '利好', stocks: '港股受益', detail: '美联储鸽派预期' },
      usStock: isUp
        ? { trend: '利空', stocks: '科技股承压', detail: '加息预期升温' }
        : { trend: '利好', stocks: '科技股受益', detail: '降息预期升温' },
    },
  }
  
  return impacts[commodity] || {
    desc: '大宗商品',
    aStock: { trend: '中性', stocks: '需具体分析', detail: '根据具体情况判断' },
    hkStock: { trend: '中性', stocks: '需具体分析', detail: '根据具体情况判断' },
    usStock: { trend: '中性', stocks: '需具体分析', detail: '根据具体情况判断' },
  }
}

// 大宗商品配置 - 按分类
const commodityConfig = {
  '贵金属': [
    { name: '黄金', code: 'aum', market: '113', region: 'domestic' },
    { name: '白银', code: 'agm', market: '113', region: 'domestic' },
    { name: '黄金', code: 'GC00Y', market: '101', region: 'international', label: 'COMEX金' },
    { name: '白银', code: 'SI00Y', market: '101', region: 'international', label: 'COMEX银' },
  ],
  '能源化工': [
    { name: '原油', code: 'scm', market: '113', region: 'domestic' },
    { name: '天然气', code: 'NG00Y', market: '101', region: 'international', label: 'NYMEX气' },
    { name: '动力煤', code: 'zcm', market: '115', region: 'domestic' },
    { name: '焦煤', code: 'jmm', market: '114', region: 'domestic' },
    { name: '焦炭', code: 'jm', market: '114', region: 'domestic' },
    { name: '原油', code: 'CL00Y', market: '101', region: 'international', label: 'WTI油' },
    { name: '燃油', code: 'fum', market: '113', region: 'domestic' },
    { name: '沥青', code: 'bum', market: '113', region: 'domestic' },
    { name: 'PTA', code: 'TAm', market: '115', region: 'domestic' },
    { name: '甲醇', code: 'MAm', market: '115', region: 'domestic' },
    { name: '乙二醇', code: 'egm', market: '114', region: 'domestic' },
    { name: '聚丙烯', code: 'ppm', market: '114', region: 'domestic' },
    { name: '塑料', code: 'lm', market: '114', region: 'domestic' },
    { name: '橡胶', code: 'rum', market: '113', region: 'domestic' },
    { name: '纯碱', code: 'SAm', market: '115', region: 'domestic' },
    { name: '玻璃', code: 'FGm', market: '115', region: 'domestic' },
    { name: '尿素', code: 'URm', market: '115', region: 'domestic' },
  ],
  '有色金属': [
    { name: '铜', code: 'cum', market: '113', region: 'domestic' },
    { name: '铝', code: 'alm', market: '113', region: 'domestic' },
    { name: '锌', code: 'znm', market: '113', region: 'domestic' },
    { name: '镍', code: 'nim', market: '113', region: 'domestic' },
    { name: '锡', code: 'snm', market: '113', region: 'domestic' },
    { name: '铅', code: 'pbm', market: '113', region: 'domestic' },
    { name: '铜', code: 'HG00Y', market: '101', region: 'international', label: 'COMEX铜' },
    { name: '碳酸锂', code: 'LCm', market: '114', region: 'domestic' },
    { name: '工业硅', code: 'sim', market: '114', region: 'domestic' },
  ],
  '黑色系': [
    { name: '螺纹钢', code: 'rbm', market: '113', region: 'domestic' },
    { name: '热轧卷板', code: 'hcm', market: '113', region: 'domestic' },
    { name: '铁矿石', code: 'im', market: '114', region: 'domestic' },
    { name: '锰硅', code: 'SMm', market: '115', region: 'domestic' },
    { name: '硅铁', code: 'SFm', market: '115', region: 'domestic' },
  ],
  '农产品': [
    { name: '大豆', code: 'am', market: '114', region: 'domestic', label: '豆一' },
    { name: '玉米', code: 'cm', market: '114', region: 'domestic' },
    { name: '豆粕', code: 'mm', market: '114', region: 'domestic' },
    { name: '豆油', code: 'ym', market: '114', region: 'domestic' },
    { name: '棕榈油', code: 'pm', market: '114', region: 'domestic' },
    { name: '菜油', code: 'OIm', market: '115', region: 'domestic' },
    { name: '菜粕', code: 'RMm', market: '115', region: 'domestic' },
    { name: '生猪', code: 'lhm', market: '114', region: 'domestic' },
    { name: '鸡蛋', code: 'jdm', market: '114', region: 'domestic' },
    { name: '棉花', code: 'CFm', market: '115', region: 'domestic' },
    { name: '白糖', code: 'SRm', market: '115', region: 'domestic' },
    { name: '苹果', code: 'APm', market: '115', region: 'domestic' },
    { name: '红枣', code: 'CJm', market: '115', region: 'domestic' },
    { name: '花生', code: 'PKm', market: '115', region: 'domestic' },
    { name: '大豆', code: 'ZS00Y', market: '101', region: 'international', label: 'CBOT豆' },
    { name: '玉米', code: 'ZC00Y', market: '101', region: 'international', label: 'CBOT玉米' },
    { name: '棉花', code: 'CT00Y', market: '101', region: 'international', label: 'ICE棉' },
  ],
  '金融板块': [
    { name: '10年国债', code: 'Tm', market: '114', region: 'domestic' },
    { name: '2年国债', code: 'TSm', market: '114', region: 'domestic' },
    { name: '5年国债', code: 'TFm', market: '114', region: 'domestic' },
    { name: '30年国债', code: 'TLm', market: '114', region: 'domestic' },
    { name: '美国10年国债', code: 'ZN00Y', market: '101', region: 'international', label: '美10Y' },
    { name: '美国2年国债', code: 'ZT00Y', market: '101', region: 'international', label: '美2Y' },
  ],
}

// 分类颜色
const categoryColors = {
  '贵金属': '#faad14',
  '能源化工': '#722ed1',
  '有色金属': '#13c2c2',
  '黑色系': '#595959',
  '农产品': '#52c41a',
  '金融板块': '#1890ff',
}

// 时间周期配置
const periodOptions = [
  { label: '1月', value: '1m' },
  { label: '3月', value: '3m' },
  { label: '6月', value: '6m' },
  { label: '1年', value: '1y' },
]

// 获取期货K线数据
// klineType: 101=日K, 102=周K, 103=月K
const fetchCommodityKline = async (code, market, period = '1y', klineType = 101) => {
  try {
    if (!code || !market) return { dates: [], prices: [], latestPrice: 0, changePct: 0, name: '', klines: [] }

    const periodMap = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }
    const months = periodMap[period] || 12
    const start = dayjs().subtract(months, 'month').format('YYYYMMDD')
    const end = dayjs().format('YYYYMMDD')

    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}.${code}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=${klineType}&fqt=1&beg=${start}&end=${end}`
    
    const response = await axios.get(url)
    const rawData = response.data?.data?.klines || []
    const name = response.data?.data?.name || code

    const dates = []
    const prices = []
    const klines = [] // 完整K线数据 [open, close, low, high]
    
    rawData.forEach((item) => {
      const fields = item.split(',')
      dates.push(fields[0])
      prices.push(parseFloat(fields[2]))
      // K线数据: 开盘、收盘、最低、最高
      klines.push([
        parseFloat(fields[1]), // open
        parseFloat(fields[2]), // close
        parseFloat(fields[4]), // low
        parseFloat(fields[3]), // high
      ])
    })

    const latestPrice = prices[prices.length - 1] || 0
    const firstPrice = prices[0] || 0
    const changePct = firstPrice ? ((latestPrice - firstPrice) / firstPrice * 100) : 0

    return { dates, prices, latestPrice, changePct, name, klines }
  } catch (error) {
    console.error('获取商品数据失败:', error)
    return { dates: [], prices: [], latestPrice: 0, changePct: 0, name: code, klines: [] }
  }
}

// 迷你图表组件
const MiniChart = memo(({ data, color, height = 40 }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !data?.prices?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    chart.setOption({
      animation: false,
      grid: { left: 0, right: 0, top: 2, bottom: 2 },
      xAxis: { type: 'category', data: data.dates, show: false },
      yAxis: { type: 'value', show: false, scale: true },
      series: [{
        type: 'line',
        data: data.prices,
        smooth: true,
        symbol: 'none',
        lineStyle: { color, width: 1.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: color + '30' },
            { offset: 1, color: color + '05' }
          ])
        }
      }]
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, color])

  return <div ref={chartRef} style={{ height }} />
})

// 详情图表组件 - K线图
const DetailChart = memo(({ data, color, chartType = 'line' }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !data?.prices?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    const isKline = chartType === 'kline' && data?.klines?.length

    const option = {
      animation: true,
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: '#e8e8e8',
        borderWidth: 1,
        textStyle: { color: '#333', fontSize: 12 },
        axisPointer: isKline ? { type: 'cross' } : { type: 'line' },
        formatter: isKline ? (params) => {
          const p = params[0]
          if (!p || !p.data) return ''
          const [open, close, low, high] = p.data
          const changeColor = close >= open ? '#cf1322' : '#389e0d'
          return `<div style="font-size:12px">
            <div style="color:#8c8c8c;margin-bottom:4px">${p.name}</div>
            <div>开: <span style="color:${changeColor}">${open?.toLocaleString()}</span></div>
            <div>收: <span style="color:${changeColor};font-weight:600">${close?.toLocaleString()}</span></div>
            <div>高: <span style="color:#cf1322">${high?.toLocaleString()}</span></div>
            <div>低: <span style="color:#389e0d">${low?.toLocaleString()}</span></div>
          </div>`
        } : (params) => {
          const p = params[0]
          return `<div style="font-size:12px">
            <div style="color:#8c8c8c">${p.name}</div>
            <div style="font-weight:600;color:${color}">${p.value?.toLocaleString()}</div>
          </div>`
        }
      },
      grid: { left: 60, right: 20, top: 20, bottom: 30 },
      xAxis: { 
        type: 'category', 
        data: data.dates,
        axisLine: { lineStyle: { color: '#e8e8e8' } },
        axisTick: { show: false },
        axisLabel: { color: '#8c8c8c', fontSize: 10 }
      },
      yAxis: { 
        type: 'value', 
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f5f5f5' } },
        axisLabel: { color: '#8c8c8c', fontSize: 10 }
      },
      series: isKline ? [{
        type: 'candlestick',
        data: data.klines,
        itemStyle: {
          color: '#cf1322',        // 阳线填充
          color0: '#389e0d',       // 阴线填充
          borderColor: '#cf1322', // 阳线边框
          borderColor0: '#389e0d' // 阴线边框
        }
      }] : [{
        type: 'line',
        data: data.prices,
        smooth: true,
        symbol: 'none',
        lineStyle: { color, width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: color + '40' },
            { offset: 1, color: color + '05' }
          ])
        }
      }]
    }

    chart.setOption(option)

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, color, chartType])

  return <div ref={chartRef} style={{ height: 280 }} />
})

// 获取相关新闻
const fetchCommodityNews = async (keyword) => {
  try {
    // 使用东方财富新闻搜索API
    const url = `https://searchapi.eastmoney.com/api/Info/Search?appkey=796d6e5f5765626368617432303135&pageindex=1&pagesize=10&keyword=${encodeURIComponent(keyword)}&type=1`
    const response = await axios.get(url)
    const list = response.data?.Data?.List || []
    return list.map(item => ({
      title: item.Title?.replace(/<[^>]+>/g, '') || '',
      url: item.Url || '',
      source: item.Source || '东方财富',
      time: item.Date || ''
    }))
  } catch (error) {
    console.error('获取新闻失败:', error)
    return []
  }
}

// 详情抽屉组件
const CommodityDetailDrawer = ({ visible, onClose, commodity, data: initialData, categoryColor, isMobile }) => {
  const [news, setNews] = useState([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [klineType, setKlineType] = useState(101) // 101=日K, 102=周K, 103=月K
  const [chartType, setChartType] = useState('kline') // kline=K线, line=折线
  const [detailData, setDetailData] = useState(null)
  const [chartLoading, setChartLoading] = useState(false)
  
  const data = detailData || initialData
  const isUp = data?.changePct >= 0
  const color = isUp ? '#cf1322' : '#389e0d'
  const Icon = isUp ? RiseOutlined : FallOutlined
  const displayName = commodity?.label || commodity?.name || ''
  const impact = commodity ? getImpactAnalysis(commodity.name, data?.changePct || 0, data?.latestPrice || 0) : null

  // 加载K线数据
  useEffect(() => {
    if (visible && commodity) {
      setChartLoading(true)
      fetchCommodityKline(commodity.code, commodity.market, '1y', klineType).then(result => {
        setDetailData(result)
        setChartLoading(false)
      })
    }
  }, [visible, commodity, klineType])

  // 加载新闻
  useEffect(() => {
    if (visible && commodity) {
      setNewsLoading(true)
      fetchCommodityNews(commodity.name).then(list => {
        setNews(list)
        setNewsLoading(false)
      })
    }
  }, [visible, commodity])

  // 关闭时重置状态
  useEffect(() => {
    if (!visible) {
      setDetailData(null)
      setKlineType(101)
      setChartType('kline')
    }
  }, [visible])

  if (!commodity) return null

  // 股票影响区块组件
  const StockImpactSection = ({ market, marketName, impact: marketImpact }) => {
    const trendColor = {
      '利好': '#389e0d',
      '利空': '#cf1322',
      '分化': '#d48806',
      '中性': '#8c8c8c',
    }[marketImpact.trend]
    
    const stocks = marketImpact.stocks?.split('、') || []
    
    return (
      <div style={{ 
        background: '#fafafa', 
        borderRadius: 8, 
        padding: 12,
        marginBottom: 12 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontWeight: 600, color: '#262626' }}>{marketName}</span>
          <Tag color={trendColor} style={{ margin: 0 }}>{marketImpact.trend}</Tag>
        </div>
        <div style={{ color: '#595959', fontSize: 13, marginBottom: 8 }}>
          {marketImpact.detail}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {stocks.map((stock, idx) => (
            <span key={idx} style={{ 
              fontSize: 12, 
              color: trendColor,
              background: trendColor + '15',
              padding: '2px 8px',
              borderRadius: 4
            }}>
              {stock}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ 
            width: 4, 
            height: 16, 
            borderRadius: 2, 
            background: categoryColor 
          }} />
          <span>{displayName}</span>
          <span style={{ 
            fontSize: 12, 
            color: commodity.region === 'domestic' ? '#d48806' : '#1677ff',
            padding: '2px 8px',
            borderRadius: 10,
            background: commodity.region === 'domestic' ? '#fffbe6' : '#e6f4ff',
          }}>
            {commodity.region === 'domestic' ? '国内' : '国际'}
          </span>
        </div>
      }
      placement="right"
      width={isMobile ? '100%' : 480}
      onClose={onClose}
      open={visible}
      styles={{ body: { padding: 16 } }}
    >
      {/* 价格信息 */}
      <div style={{ 
        background: '#fafafa', 
        borderRadius: 8, 
        padding: 16, 
        marginBottom: 16 
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ 
            fontSize: 28, 
            fontWeight: 600, 
            color,
            letterSpacing: '-1px'
          }}>
            {data.latestPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: 16, color, fontWeight: 500 }}>
            <Icon style={{ marginRight: 4 }} />
            {isUp ? '+' : ''}{data.changePct?.toFixed(2)}%
          </span>
        </div>
        <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 4 }}>
          {impact?.desc}
        </div>
      </div>

      {/* 历史走势图 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ 
          fontSize: 14, 
          fontWeight: 600, 
          color: '#262626', 
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 3, height: 14, borderRadius: 2, background: categoryColor }} />
            历史走势
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* K线周期切换 */}
            <Segmented
              size="small"
              value={klineType}
              onChange={setKlineType}
              options={[
                { label: '日K', value: 101 },
                { label: '周K', value: 102 },
                { label: '月K', value: 103 },
              ]}
              style={{ background: '#f5f5f5' }}
            />
            {/* 图表类型切换 */}
            <Segmented
              size="small"
              value={chartType}
              onChange={setChartType}
              options={[
                { label: 'K线', value: 'kline' },
                { label: '折线', value: 'line' },
              ]}
              style={{ background: '#f5f5f5' }}
            />
          </div>
        </div>
        <Spin spinning={chartLoading}>
          {data?.prices?.length ? (
            <DetailChart data={data} color={color} chartType={chartType} />
          ) : (
            <Empty description="暂无K线数据" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '40px 0' }} />
          )}
        </Spin>
      </div>

      {/* 市场影响分析 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ 
          fontSize: 14, 
          fontWeight: 600, 
          color: '#262626', 
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <span style={{ width: 3, height: 14, borderRadius: 2, background: categoryColor }} />
          市场影响分析
        </div>
        
        {impact && (
          <>
            <StockImpactSection market="aStock" marketName="A股" impact={impact.aStock} />
            <StockImpactSection market="hkStock" marketName="港股" impact={impact.hkStock} />
            <StockImpactSection market="usStock" marketName="美股" impact={impact.usStock} />
          </>
        )}
      </div>

      {/* 相关新闻 */}
      <div>
        <div style={{ 
          fontSize: 14, 
          fontWeight: 600, 
          color: '#262626', 
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <span style={{ width: 3, height: 14, borderRadius: 2, background: categoryColor }} />
          相关新闻
        </div>
        
        <Spin spinning={newsLoading}>
          {news.length > 0 ? (
            <List
              size="small"
              dataSource={news}
              renderItem={(item) => (
                <List.Item style={{ padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ width: '100%' }}>
                    <a 
                      href={item.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ 
                        color: '#262626', 
                        fontSize: 13,
                        display: 'block',
                        marginBottom: 4,
                        lineHeight: 1.5
                      }}
                    >
                      {item.title}
                      <LinkOutlined style={{ marginLeft: 4, fontSize: 10, color: '#8c8c8c' }} />
                    </a>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#8c8c8c' }}>
                      <span>{item.source}</span>
                      <span>{item.time}</span>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          ) : (
            <Empty description="暂无相关新闻" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Spin>
      </div>
    </Drawer>
  )
}

// 影响标签组件 - 简约版
const ImpactTag = ({ trend }) => {
  const colorMap = {
    '利好': '#389e0d',
    '利空': '#cf1322',
    '分化': '#d48806',
    '中性': '#8c8c8c',
  }
  return (
    <span style={{ 
      fontSize: 10, 
      color: colorMap[trend],
      fontWeight: 500,
      padding: '1px 4px',
      borderRadius: 2,
      backgroundColor: colorMap[trend] + '12',
    }}>
      {trend}
    </span>
  )
}

// 商品卡片组件 - 素雅风格
const CommodityCard = memo(({ commodity, period, isMobile, categoryColor, onClick, refreshKey }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const isFirstLoad = useRef(true)

  useEffect(() => {
    const loadData = async () => {
      // 只有首次加载才显示 loading
      if (isFirstLoad.current) {
        setLoading(true)
      }
      const result = await fetchCommodityKline(commodity.code, commodity.market, period)
      setData(result)
      setLoading(false)
      isFirstLoad.current = false
    }
    loadData()
  }, [commodity, period, refreshKey])

  const isUp = data?.changePct >= 0
  const color = isUp ? '#cf1322' : '#389e0d'
  const Icon = isUp ? RiseOutlined : FallOutlined
  const displayName = commodity.label || commodity.name
  const impact = getImpactAnalysis(commodity.name, data?.changePct || 0, data?.latestPrice || 0)

  const handleClick = () => {
    if (data?.prices?.length && onClick) {
      onClick(commodity, data)
    }
  }

  return (
    <div style={{ 
      height: '100%',
      background: '#fff',
      borderRadius: 6,
      border: '1px solid #f0f0f0',
      overflow: 'hidden',
      transition: 'box-shadow 0.2s',
      cursor: data?.prices?.length ? 'pointer' : 'default',
    }}
    onClick={handleClick}
    onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
    onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* 顶部分类色条 */}
      <div style={{ height: 2, background: categoryColor }} />
      
      <div style={{ padding: isMobile ? '8px 10px' : '10px 12px' }}>
        <Spin spinning={loading} size="small">
          {data?.prices?.length ? (
            <>
              {/* 标题行 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ 
                  fontSize: isMobile ? 13 : 14, 
                  fontWeight: 600,
                  color: '#262626'
                }}>
                  {displayName}
                </span>
                <span style={{ 
                  fontSize: 10, 
                  color: commodity.region === 'domestic' ? '#d48806' : '#1677ff',
                  padding: '1px 6px',
                  borderRadius: 10,
                  background: commodity.region === 'domestic' ? '#fffbe6' : '#e6f4ff',
                }}>
                  {commodity.region === 'domestic' ? '国内' : '国际'}
                </span>
              </div>
              
              {/* 价格行 */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span style={{ 
                  fontSize: isMobile ? 18 : 20, 
                  fontWeight: 600, 
                  color,
                  letterSpacing: '-0.5px'
                }}>
                  {data.latestPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span style={{ fontSize: 12, color, fontWeight: 500 }}>
                  <Icon style={{ marginRight: 2, fontSize: 10 }} />
                  {isUp ? '+' : ''}{data.changePct?.toFixed(2)}%
                </span>
              </div>

              {/* 迷你图 */}
              <MiniChart data={data} color={color} height={isMobile ? 32 : 38} />

              {/* 分隔线 */}
              <div style={{ height: 1, background: '#f5f5f5', margin: '8px 0' }} />

              {/* 影响分析 */}
              <div style={{ fontSize: 11 }}>
                <Tooltip title={impact.desc} placement="top">
                  <div style={{ 
                    color: '#8c8c8c', 
                    fontSize: 10, 
                    marginBottom: 6,
                    cursor: 'help',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <InfoCircleOutlined style={{ fontSize: 10 }} />
                    <span>市场影响</span>
                  </div>
                </Tooltip>
                
                {/* A股 */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#8c8c8c', fontSize: 10, width: 28 }}>A股</span>
                    <ImpactTag trend={impact.aStock.trend} />
                  </div>
                  <Tooltip title={impact.aStock.detail} placement="top">
                    <div style={{ 
                      color: '#595959', 
                      fontSize: 10, 
                      marginTop: 2,
                      paddingLeft: 28,
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap',
                      cursor: 'help'
                    }}>
                      {impact.aStock.stocks}
                    </div>
                  </Tooltip>
                </div>

                {/* 港股 */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#8c8c8c', fontSize: 10, width: 28 }}>港股</span>
                    <ImpactTag trend={impact.hkStock.trend} />
                  </div>
                  <Tooltip title={impact.hkStock.detail} placement="top">
                    <div style={{ 
                      color: '#595959', 
                      fontSize: 10, 
                      marginTop: 2,
                      paddingLeft: 28,
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap',
                      cursor: 'help'
                    }}>
                      {impact.hkStock.stocks}
                    </div>
                  </Tooltip>
                </div>

                {/* 美股 */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#8c8c8c', fontSize: 10, width: 28 }}>美股</span>
                    <ImpactTag trend={impact.usStock.trend} />
                  </div>
                  <Tooltip title={impact.usStock.detail} placement="top">
                    <div style={{ 
                      color: '#595959', 
                      fontSize: 10, 
                      marginTop: 2,
                      paddingLeft: 28,
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap',
                      cursor: 'help'
                    }}>
                      {impact.usStock.stocks}
                    </div>
                  </Tooltip>
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#bfbfbf', fontSize: 12 }}>
              暂无数据
            </div>
          )}
        </Spin>
      </div>
    </div>
  )
})

// 大宗商品页面
export default function CommodityPage() {
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const [searchParams, setSearchParams] = useSearchParams()
  
  // 从 URL 读取筛选条件，设置默认值
  const period = searchParams.get('period') || '3m'
  const region = searchParams.get('region') || 'all'
  const selectedCategory = searchParams.get('category') || 'all'
  
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Drawer 状态
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [selectedCommodity, setSelectedCommodity] = useState(null)
  const [selectedData, setSelectedData] = useState(null)
  const [selectedCategoryColor, setSelectedCategoryColor] = useState('#1890ff')

  // 更新 URL 参数
  const updateSearchParams = useCallback((key, value) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      if (value === 'all' || value === '3m') {
        // 默认值不写入 URL
        newParams.delete(key)
      } else {
        newParams.set(key, value)
      }
      return newParams
    })
  }, [setSearchParams])

  const setPeriod = (value) => updateSearchParams('period', value)
  const setRegion = (value) => updateSearchParams('region', value)
  const setSelectedCategory = (value) => updateSearchParams('category', value)

  // 过滤商品
  const getFilteredCommodities = (category) => {
    let items = commodityConfig[category] || []
    if (region !== 'all') {
      items = items.filter(c => c.region === region)
    }
    return items
  }

  // 打开详情
  const handleCardClick = (commodity, data, categoryColor) => {
    setSelectedCommodity(commodity)
    setSelectedData(data)
    setSelectedCategoryColor(categoryColor)
    setDrawerVisible(true)
  }

  return (
    <div style={{ padding: isMobile ? 8 : 0, background: '#fafafa', minHeight: '100vh' }}>
      {/* 顶部控制栏 */}
      <div style={{ 
        background: '#fff', 
        borderRadius: 8, 
        padding: isMobile ? 12 : 16, 
        marginBottom: isMobile ? 12 : 16,
        border: '1px solid #f0f0f0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: isMobile ? 16 : 18, fontWeight: 600, color: '#262626' }}>大宗商品走势</span>
            <Segmented
              size="small"
              value={region}
              onChange={setRegion}
              options={[
                { label: '全部', value: 'all' },
                { label: '国内', value: 'domestic' },
                { label: '国际', value: 'international' },
              ]}
              style={{ background: '#f5f5f5' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio.Group 
              value={period} 
              onChange={(e) => setPeriod(e.target.value)} 
              size="small"
              optionType="button"
            >
              {periodOptions.map(opt => (
                <Radio.Button key={opt.value} value={opt.value} style={{ borderColor: '#d9d9d9' }}>
                  {opt.label}
                </Radio.Button>
              ))}
            </Radio.Group>
            <Button 
              size="small" 
              icon={<ReloadOutlined />}
              onClick={() => {
                setRefreshKey(k => k + 1)
                message.success('数据刷新中...')
              }}
              style={{ borderColor: '#d9d9d9' }}
            >
              刷新
            </Button>
          </div>
        </div>
        
        {/* 分类筛选 */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
          <Radio.Group 
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)} 
            size="small"
            optionType="button"
          >
            <Radio.Button value="all" style={{ borderColor: '#d9d9d9' }}>全部</Radio.Button>
            {Object.keys(commodityConfig).map(cat => (
              <Radio.Button key={cat} value={cat} style={{ borderColor: '#d9d9d9' }}>
                <span style={{ 
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: categoryColors[cat],
                  marginRight: 4,
                  verticalAlign: 'middle'
                }} />
                {cat}
              </Radio.Button>
            ))}
          </Radio.Group>
        </div>
      </div>

      {/* 商品卡片列表 - 按分类显示 */}
      {(selectedCategory === 'all' ? Object.keys(commodityConfig) : [selectedCategory]).map(category => {
        const items = getFilteredCommodities(category)
        if (items.length === 0) return null
        
        return (
          <div key={category} style={{ marginBottom: isMobile ? 16 : 20 }}>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
              paddingLeft: 2
            }}>
              <span style={{ 
                width: 3,
                height: 16,
                borderRadius: 2,
                background: categoryColors[category],
              }} />
              <span style={{ 
                fontSize: isMobile ? 14 : 15, 
                fontWeight: 600, 
                color: '#262626',
              }}>
                {category}
              </span>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                ({items.length})
              </span>
            </div>
            <Row gutter={[isMobile ? 8 : 12, isMobile ? 8 : 12]}>
              {items.map((commodity, idx) => (
                <Col key={`${commodity.code}-${idx}`} xs={12} sm={8} md={6} lg={4} xl={4}>
                  <CommodityCard 
                    commodity={commodity} 
                    period={period} 
                    isMobile={isMobile}
                    categoryColor={categoryColors[category]}
                    onClick={(c, d) => handleCardClick(c, d, categoryColors[category])}
                    refreshKey={refreshKey}
                  />
                </Col>
              ))}
            </Row>
          </div>
        )
      })}

      {/* 详情抽屉 */}
      <CommodityDetailDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        commodity={selectedCommodity}
        data={selectedData}
        categoryColor={selectedCategoryColor}
        isMobile={isMobile}
      />
    </div>
  )
}
