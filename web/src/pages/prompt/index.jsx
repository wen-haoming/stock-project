import React, { useState, useMemo } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Tag, 
  Button, 
  Modal, 
  message, 
  Typography, 
  Space,
  Divider,
  Badge,
  Empty,
  Select,
  Input
} from 'antd';
import { 
  CopyOutlined, 
  EyeOutlined, 
  RobotOutlined,
  BugOutlined
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { promptData } from './config';
import { styles } from './styles';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// 调试弹窗组件
const DebugModal = ({ visible, prompt, onClose }) => {
  const [selectedAI, setSelectedAI] = useState('doubao');
  const [promptContent, setPromptContent] = useState('');
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);

  // AI 平台配置
  const aiPlatforms = {
    doubao: {
      name: '豆包',
      url: 'https://www.doubao.com/',
      icon: '🤖'
    },
    kimi: {
      name: 'Kimi',
      url: 'https://kimi.moonshot.cn/',
      icon: '🔍'
    }
  };

  // 初始化提示词内容
  React.useEffect(() => {
    if (prompt && visible) {
      setPromptContent(prompt.content);
    }
  }, [prompt, visible]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptContent);
      message.success('提示词已复制到剪贴板');
    } catch (err) {
      message.error('复制失败，请手动复制');
    }
  };

  const handleClear = () => {
    setPromptContent('');
  };

  const handleReset = () => {
    if (prompt) {
      setPromptContent(prompt.content);
    }
  };

  const handleIframeLoad = () => {
    setIframeLoading(false);
    setIframeError(false);
  };

  const handleIframeError = () => {
    setIframeLoading(false);
    setIframeError(true);
  };

  const handleAIChange = (value) => {
    setSelectedAI(value);
    setIframeLoading(true);
    setIframeError(false);
  };

  return (
    <Modal
      title={
        <Space>
          <BugOutlined />
          调试提示词 - {prompt?.title}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width="95vw"
      style={{ top: 20 }}
      bodyStyle={{ height: '85vh', padding: 0 }}
      footer={[
        <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={handleCopy}>
          复制提示词
        </Button>,
        <Button key="clear" onClick={handleClear}>
          清空
        </Button>,
        <Button key="reset" onClick={handleReset}>
          重置
        </Button>,
        <Button key="close" onClick={onClose}>
          关闭
        </Button>
      ]}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶部工具栏 */}
        <div style={{ 
          padding: '16px', 
          borderBottom: '1px solid #f0f0f0',
          background: '#fafafa'
        }}>
          <Space>
            <span>选择 AI 平台：</span>
            <Select
              value={selectedAI}
              onChange={handleAIChange}
              style={{ width: 120 }}
            >
              {Object.entries(aiPlatforms).map(([key, platform]) => (
                <Option key={key} value={key}>
                  <Space>
                    <span>{platform.icon}</span>
                    {platform.name}
                  </Space>
                </Option>
              ))}
            </Select>
            <Text type="secondary">
              当前选择：{aiPlatforms[selectedAI]?.name}
            </Text>
            <Divider type="vertical" />
            <Button 
              size="small" 
              icon={<CopyOutlined />}
              onClick={handleCopy}
              disabled={!promptContent.trim()}
            >
              复制到剪贴板
            </Button>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              提示：复制后可直接粘贴到右侧 AI 平台中使用
            </Text>
          </Space>
        </div>

        {/* 主要内容区域 */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 左侧提示词编辑区 */}
          <div style={{ 
            width: '40%', 
            borderRight: '1px solid #f0f0f0',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ 
              padding: '16px', 
              borderBottom: '1px solid #f0f0f0',
              background: '#fafafa'
            }}>
              <Title level={5} style={{ margin: 0 }}>
                提示词模板
              </Title>
              <Paragraph type="secondary" style={{ margin: 0, fontSize: '12px' }}>
                编辑提示词内容，右侧将实时显示在 AI 平台中的效果
              </Paragraph>
            </div>
            <div style={{ flex: 1, padding: '16px' }}>
              <TextArea
                value={promptContent}
                onChange={(e) => setPromptContent(e.target.value)}
                placeholder="请输入提示词内容..."
                style={{ 
                  height: '100%', 
                  resize: 'none',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  lineHeight: '1.6'
                }}
              />
            </div>
          </div>

          {/* 右侧 AI 平台预览区 */}
          <div style={{ 
            flex: 1, 
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ 
              padding: '16px', 
              borderBottom: '1px solid #f0f0f0',
              background: '#fafafa'
            }}>
                             <Title level={5} style={{ margin: 0 }}>
                 <Space>
                   <span>{aiPlatforms[selectedAI]?.icon}</span>
                   {aiPlatforms[selectedAI]?.name} 预览
                 </Space>
               </Title>
               <Paragraph type="secondary" style={{ margin: 0, fontSize: '12px' }}>
                 模拟在 {aiPlatforms[selectedAI]?.name} 中的使用效果
               </Paragraph>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              {/* 浏览器样式框架 */}
              <div style={{
                height: '100%',
                border: '1px solid #d9d9d9',
                borderRadius: '8px',
                overflow: 'hidden',
                background: '#fff'
              }}>
                {/* 浏览器地址栏 */}
                <div style={{
                  height: '40px',
                  background: '#f5f5f5',
                  borderBottom: '1px solid #d9d9d9',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  gap: '8px'
                }}>
                  {/* 浏览器控制按钮 */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: '#ff5f57',
                      border: '1px solid #e0443e'
                    }} />
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: '#ffbd2e',
                      border: '1px solid #dea123'
                    }} />
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: '#28ca42',
                      border: '1px solid #1aab29'
                    }} />
                  </div>
                  
                  {/* 地址栏 */}
                  <div style={{
                    flex: 1,
                    height: '24px',
                    background: '#fff',
                    border: '1px solid #d9d9d9',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    fontSize: '12px',
                    color: '#666'
                  }}>
                    {aiPlatforms[selectedAI]?.url}
                  </div>
                </div>

                {/* iframe 内容区域 */}
                <div style={{
                  height: 'calc(100% - 40px)',
                  background: '#fff',
                  position: 'relative'
                }}>
                  {/* 加载状态 */}
                  {iframeLoading && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>
                          {aiPlatforms[selectedAI]?.icon}
                        </div>
                        <div>正在加载 {aiPlatforms[selectedAI]?.name}...</div>
                      </div>
                    </div>
                  )}

                  {/* 错误状态 */}
                  {iframeError && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1
                    }}>
                      <div style={{ textAlign: 'center', color: '#ff4d4f' }}>
                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
                        <div>加载失败，请检查网络连接</div>
                        <Button 
                          type="primary" 
                          size="small" 
                          style={{ marginTop: '8px' }}
                          onClick={() => {
                            setIframeLoading(true);
                            setIframeError(false);
                          }}
                        >
                          重新加载
                        </Button>
                      </div>
                    </div>
                  )}

                  <iframe
                    src={aiPlatforms[selectedAI]?.url}
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      background: '#fff',
                      opacity: iframeLoading ? 0 : 1,
                      transition: 'opacity 0.3s'
                    }}
                    title={`${aiPlatforms[selectedAI]?.name} 预览`}
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                    referrerPolicy="no-referrer"
                    onLoad={handleIframeLoad}
                    onError={handleIframeError}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// 提示词卡片组件
const PromptCard = ({ prompt, onPreview, onCopy, onDebug }) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt.content);
      message.success('提示词已复制到剪贴板');
      onCopy?.(prompt);
    } catch (err) {
      message.error('复制失败，请手动复制');
    }
  };

  return (
    <Card
      hoverable
      style={styles.card}
      // bodyStyle={styles.cardBody}
    >
      <div style={styles.cardContent}>
        <Title level={5} style={styles.cardTitle}>
          {prompt.title}
        </Title>
        
        <Paragraph 
          type="secondary" 
          style={styles.cardDescription}
        >
          {prompt.description}
        </Paragraph>
        
        <Space wrap style={styles.cardTags}>
          {prompt.tags.map(tag => (
            <Tag key={tag} size="small" color="blue">
              {tag}
            </Tag>
          ))}
        </Space>

        <div style={styles.cardAiRecommend}>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            建议 AI：
          </Text>
          <Space size={4}>
            {prompt.aiRecommend.map(ai => (
              <Tag key={ai} size="small" color="green">
                {ai}
              </Tag>
            ))}
          </Space>
        </div>

        <Paragraph 
          type="secondary" 
          style={styles.cardUsage}
        >
          {prompt.usage}
        </Paragraph>
      </div>

      <div style={styles.cardActions}>
        <Space>
          <Button 
            type="primary" 
            size="small" 
            icon={<EyeOutlined />}
            onClick={() => onPreview(prompt)}
          >
            预览
          </Button>
          <Button 
            size="small" 
            icon={<CopyOutlined />}
            onClick={handleCopy}
          >
            复制
          </Button>
        </Space>
      </div>
    </Card>
  );
};

// 预览模态框组件
const PromptPreviewModal = ({ visible, prompt, onClose }) => {
  if (!prompt) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt.content);
      message.success('提示词已复制到剪贴板');
    } catch (err) {
      message.error('复制失败，请手动复制');
    }
  };

  return (
    <Modal
      title={
        <Space>
          <RobotOutlined />
          {prompt.title}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button 
          key="copy" 
          type="primary" 
          icon={<CopyOutlined />} 
          onClick={handleCopy}
        >
          复制提示词
        </Button>,
        <Button key="close" onClick={onClose}>
          关闭
        </Button>
      ]}
      style={styles.previewModal}
    >
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
          <Text strong>提示词内容：</Text>
        </Paragraph>
        <div style={styles.previewContent}>
          {prompt.content}
        </div>
      </div>
    </Modal>
  );
};

// 分类展示组件
const CategorySection = ({ category, onPreview, onCopy, onDebug }) => {
  return (
    <div style={styles.categorySection}>
      <div style={styles.categoryTitle}>
        <Title level={5} style={{ color: category.color }}>
          <Space>
            {category.icon}
            {category.name}
            {/* <Badge 
              count={category.prompts.length} 
              style={{ backgroundColor: category.color }} 
            /> */}
          </Space>
        </Title>
      </div>

      <Row gutter={[16, 16]} wrap>
        {category.prompts.map(prompt => (
          <Col key={prompt.id} >
            <PromptCard
              prompt={prompt}
              onPreview={onPreview}
              onCopy={onCopy}
            />
          </Col>
        ))}
      </Row>
    </div>
  );
};

// 主页面组件
const PromptPage = () => {
  const location = useLocation();
  const [previewVisible, setPreviewVisible] = useState(false);
  const [debugVisible, setDebugVisible] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState(null);

  // 根据当前路径获取分类ID
  const currentCategoryId = useMemo(() => {
    const path = location.pathname;
    if (path === '/') return null; // 首页显示所有分类
    return path.substring(1); // 移除开头的 '/'
  }, [location.pathname]);

  // 过滤要显示的分类
  const displayCategories = useMemo(() => {
    if (!currentCategoryId) {
      return promptData.categories; // 显示所有分类
    }
    const category = promptData.categories.find(cat => cat.id === currentCategoryId);
    return category ? [category] : [];
  }, [currentCategoryId]);

  const handlePreview = (prompt) => {
    setCurrentPrompt(prompt);
    setPreviewVisible(true);
  };

  const handleDebug = (prompt) => {
    setCurrentPrompt(prompt);
  };

  const handleCopy = (prompt) => {
    // 可以在这里添加复制统计等功能
    console.log('复制了提示词:', prompt.title);
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {displayCategories.length > 0 ? (
          displayCategories.map(category => (
            <CategorySection
              key={category.id}
              category={category}
              onPreview={handlePreview}
              onCopy={handleCopy}
            />
          ))
        ) : (
          <Empty 
            description="未找到相关分类" 
            style={styles.emptyContainer}
          />
        )}
        <PromptPreviewModal
          visible={previewVisible}
          prompt={currentPrompt}
          onClose={() => setPreviewVisible(false)}
        />
      </div>
    </div>
  );
};

export default PromptPage; 
