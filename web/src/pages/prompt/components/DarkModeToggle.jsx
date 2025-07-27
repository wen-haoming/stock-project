import React from 'react';
import { Switch, Tooltip } from 'antd';
import { BulbOutlined, BulbFilled } from '@ant-design/icons';

const DarkModeToggle = ({ isDarkMode, onToggle }) => {
  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 1000,
      background: isDarkMode ? '#1f1f1f' : '#ffffff',
      border: `1px solid ${isDarkMode ? '#303030' : '#d9d9d9'}`,
      borderRadius: '8px',
      padding: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      transition: 'all 0.3s ease'
    }}>
      <Tooltip title={isDarkMode ? '切换到亮色模式' : '切换到暗色模式'}>
        <Switch
          checked={isDarkMode}
          onChange={onToggle}
          checkedChildren={<BulbFilled style={{ color: '#faad14' }} />}
          unCheckedChildren={<BulbOutlined />}
          size="small"
        />
      </Tooltip>
    </div>
  );
};

export default DarkModeToggle; 
