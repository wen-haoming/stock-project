import { ProTable } from '@ant-design/pro-components';
import { useRequest } from 'ahooks';
import axios from 'axios';

const columns = [
  {
    title: '代码',
    dataIndex: '代码',
    width: 100,
    fixed: 'left',
  },
  {
    title: '名称',
    dataIndex: '名称',
    width: 120,
    fixed: 'left',
  },
  {
    title: '最新价',
    dataIndex: '最新价',
    width: 100,
    sorter: true,
  },
  {
    title: '涨跌幅',
    dataIndex: '涨跌幅',
    width: 100,
    sorter: true,
    render: (text) => (
      <span style={{ color: text > 0 ? '#f5222d' : text < 0 ? '#52c41a' : 'inherit' }}>
        {text > 0 ? '+' : ''}{text}%
      </span>
    ),
  },
  {
    title: '涨跌额',
    dataIndex: '涨跌额',
    width: 100,
    render: (text) => (
      <span style={{ color: text > 0 ? '#f5222d' : text < 0 ? '#52c41a' : 'inherit' }}>
        {text > 0 ? '+' : ''}{text}
      </span>
    ),
  },
  {
    title: '成交量',
    dataIndex: '成交量',
    width: 120,
    sorter: true,
  },
  {
    title: '成交额',
    dataIndex: '成交额',
    width: 120,
    sorter: true,
  },
  {
    title: '振幅',
    dataIndex: '振幅',
    width: 100,
    sorter: true,
  },
  {
    title: '最高',
    dataIndex: '最高',
    width: 100,
  },
  {
    title: '最低',
    dataIndex: '最低',
    width: 100,
  },
  {
    title: '今开',
    dataIndex: '今开',
    width: 100,
  },
  {
    title: '昨收',
    dataIndex: '昨收',
    width: 100,
  },
  {
    title: '量比',
    dataIndex: '量比',
    width: 100,
    sorter: true,
  },
  {
    title: '换手率',
    dataIndex: '换手率',
    width: 100,
    sorter: true,
  },
  {
    title: '市盈率',
    dataIndex: '市盈率-动态',
    width: 100,
    sorter: true,
  },
  {
    title: '市净率',
    dataIndex: '市净率',
    width: 100,
    sorter: true,
  },
  {
    title: '总市值',
    dataIndex: '总市值',
    width: 120,
    sorter: true,
  },
  {
    title: '流通市值',
    dataIndex: '流通市值',
    width: 120,
    sorter: true,
  },
];

export default function StockList() {

  return (
    <ProTable
      columns={columns}
      style={{width:'100%'}}
      request={async (params = {}) => {
        const { current, pageSize } = params;
        
        const { data } = await axios.get('/api/v1/stock/all', {
          params: {
            page: current,
            pageSize,
            code:params['代码'],
            name:params['名称'],
          },
        });
        return {
          data: data.data,
          total: data.total,
          success: true,
        };
      }}
      scroll={{ x: 1000 }}
      rowKey="代码"
      search={true}
      pagination={{
        showQuickJumper: true,
        showSizeChanger: true,
      }}
      dateFormatter="string"
      toolbar={{
        title: '股票列表',
      }}
    />
  );
} 
