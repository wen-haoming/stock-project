import { useState, useMemo } from 'react';
import { Modal, Button, Space, Typography, Divider, Tag, message, Tabs } from 'antd';
import { CopyOutlined, RobotOutlined, CodeOutlined } from '@ant-design/icons';
import { SandpackProvider, SandpackPreview } from '@codesandbox/sandpack-react';

const { Paragraph, Text } = Typography;

const CodePreviewModal = ({ visible, prompt, onClose, currentStyles }) => {
  const [activeTab, setActiveTab] = useState('preview');

  // 检测代码类型
  const detectCodeType = (content) => {
    if (!content) return 'html';
    
    // 优先检测Vue，因为Vue组件可能也包含export default
    if (content.includes('<template>') || 
        (content.includes('export default') && content.includes('setup()')) ||
        content.includes('Vue.createApp') ||
        content.includes('createApp')) {
      return 'vue';
    } else if (content.includes('import React') || 
               content.includes('function App') ||
               content.includes('useState') ||
               content.includes('useEffect')) {
      return 'react';
    } else {
      return 'html';
    }
  };

  const codeType = detectCodeType(prompt?.content);

  // 生成Sandpack配置
  const sandpackConfig = useMemo(() => {
    if (!prompt) return {};
    
    const baseConfig = {
      theme: currentStyles?.isDarkMode ? 'dark' : 'light',
      template: codeType === 'react' ? 'react' : codeType === 'vue' ? 'vue' : 'vanilla',
      files: {},
      customSetup: {
        dependencies: {}
      }
    };

    // 如果有代码文件，使用代码文件；否则使用content
    const codeFiles = prompt.codeFiles || {};
    const hasCodeFiles = Object.keys(codeFiles).length > 0;
    
    if (hasCodeFiles) {
      // 使用动态加载的代码文件
      Object.entries(codeFiles).forEach(([fileName, content]) => {
        const filePath = `/${fileName}`;
        baseConfig.files[filePath] = content;
      });
      
      // 根据代码类型添加必要的入口文件
      switch (codeType) {
        case 'react':
          if (!baseConfig.files['/index.js']) {
            baseConfig.files['/index.js'] = `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';

const root = createRoot(document.getElementById('root'));
root.render(<App />);`;
          }
          break;
        case 'vue':
          if (!baseConfig.files['/src/main.js']) {
            baseConfig.files['/src/main.js'] = `import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');`;
          }
          if (!baseConfig.files['/index.html']) {
            baseConfig.files['/index.html'] = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vue App</title>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`;
          }
          baseConfig.template = 'vue';
          break;
        case 'html':
        default:
          baseConfig.template = 'vanilla';
          break;
      }
    } else {
      // 使用content作为代码内容
      switch (codeType) {
        case 'react':
          baseConfig.files = {
            '/App.js': prompt.content,
            '/index.js': `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = createRoot(document.getElementById('root'));
root.render(<App />);`
          };
          break;
        case 'vue':
          baseConfig.files = {
            '/src/App.vue': prompt.content,
            '/src/main.js': `import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');`,
            '/index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vue App</title>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`
          };
          baseConfig.template = 'vue';
          break;
        case 'html':
        default:
          baseConfig.template = 'vanilla';
          baseConfig.files = {
            '/index.html': prompt.content
          };
          break;
      }
    }

    return baseConfig;
  }, [prompt, codeType, currentStyles?.isDarkMode]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt?.content || '');
      message.success('代码已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  if (!prompt) return null;

  const tabItems = [
    {
      key: 'preview',
      label: (
        <Space>
          <CodeOutlined />
          预览效果
        </Space>
      ),
      children: (
        <div style={{height:'72vh',width:'100%'}}>
          <SandpackProvider style={{height:'100%'}} {...sandpackConfig}>
          <SandpackPreview style={{height:'100%'}} />
      </SandpackProvider>
        </div>
      )
    },
    {
      key: 'prompt',
      label: (
        <Space>
          <RobotOutlined />
          提示词
        </Space>
      ),
      children: (
        <div>
          <Paragraph>
            <Text strong>描述：</Text> {prompt.description}
          </Paragraph>
          
          <Divider />
          
          <Paragraph>
            <Text strong>建议 AI：</Text>
            <Space style={{ marginLeft: 8 }}>
              {prompt.aiRecommend.map(ai => (
                <Tag key={ai} color="green">
                  {ai}
                </Tag>
              ))}
            </Space>
          </Paragraph>
          
          <Paragraph>
            <Text strong>使用场景：</Text> {prompt.usage}
          </Paragraph>
          
          <Divider />
          
          <Paragraph>
            <Text strong>代码内容：</Text>
          </Paragraph>
          <div style={currentStyles.previewContent}>
            <pre style={{ 
              background: currentStyles.isDarkMode ? '#1f1f1f' : '#f5f5f5',
              padding: '16px',
              borderRadius: '6px',
              overflow: 'auto',
              fontSize: '14px',
              lineHeight: '1.5'
            }}>
              {prompt.content}
            </pre>
          </div>
        </div>
      )
    }
  ];

  return (
    <Modal
      title={
        <Space>
          <RobotOutlined />
          {prompt.title}
          <Tag color={codeType === 'react' ? 'blue' : codeType === 'vue' ? 'green' : 'orange'}>
            {codeType.toUpperCase()}
          </Tag>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width="90%"
      style={{ top: 20 }}
      footer={[
        <Button 
          key="copy" 
          type="primary" 
          icon={<CopyOutlined />} 
          onClick={handleCopy}
        >
          复制代码
        </Button>,
        <Button key="close" onClick={onClose}>
          关闭
        </Button>
      ]}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        style={{ marginTop: 16 }}
      />
    </Modal>
  );
};

export default CodePreviewModal; 
