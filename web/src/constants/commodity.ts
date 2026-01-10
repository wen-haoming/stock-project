/**
 * 大宗商品配置
 * 市场代码说明：
 * - 113: 上期所 (SHFE)
 * - 114: 大商所 (DCE)
 * - 115: 郑商所 (CZCE)
 * - 225: 广期所 (GFEX) - 碳酸锂、工业硅
 * - 101: COMEX (黄金、白银、铜)
 * - 102: NYMEX/ICE (原油、天然气)
 * - 8: 中金所 (国债期货)
 */

// 大宗商品配置 - 按分类
export const commodityConfig = {
  '贵金属': [
    { name: '黄金', code: 'aum', market: '113', region: 'domestic' },
    { name: '白银', code: 'agm', market: '113', region: 'domestic' },
    { name: '黄金', code: 'GC00Y', market: '101', region: 'international', label: 'COMEX金' },
    { name: '白银', code: 'SI00Y', market: '101', region: 'international', label: 'COMEX银' },
  ],
  '能源化工': [
    { name: '原油', code: 'scm', market: '113', region: 'domestic' },
    { name: '天然气', code: 'NG00Y', market: '102', region: 'international', label: 'NYMEX气' },
    { name: '动力煤', code: 'zcm', market: '115', region: 'domestic' },
    { name: '焦煤', code: 'jmm', market: '114', region: 'domestic' },
    { name: '焦炭', code: 'jm', market: '114', region: 'domestic' },
    { name: '原油', code: 'CL00Y', market: '102', region: 'international', label: 'WTI油' },
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
    { name: '碳酸锂', code: 'lcm', market: '225', region: 'domestic' },
    { name: '工业硅', code: 'sim', market: '225', region: 'domestic' },
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
  ],
  '金融板块': [
    { name: '2年国债', code: '130130', market: '8', region: 'domestic' },
    { name: '5年国债', code: '050130', market: '8', region: 'domestic' },
    { name: '10年国债', code: '110130', market: '8', region: 'domestic' },
    { name: '30年国债', code: '140130', market: '8', region: 'domestic' },
  ],
}

// 分类颜色
export const categoryColors = {
  '贵金属': '#faad14',
  '能源化工': '#722ed1',
  '有色金属': '#13c2c2',
  '黑色系': '#595959',
  '农产品': '#52c41a',
  '金融板块': '#1890ff',
}
