import React from 'react';
import { Card, Button, Space, Tag, Typography, message } from 'antd';
import { CopyOutlined, EyeOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const PromptCard = ({ prompt, onPreview, onCopy, currentStyles }) => {
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
      style={currentStyles.card}
    >
      <div style={currentStyles.cardContent}>
        <Title level={5} style={currentStyles.cardTitle}>
          {prompt.title}
        </Title>
        
        <Paragraph 
          type="secondary" 
          style={currentStyles.cardDescription}
        >
          {prompt.description}
        </Paragraph>
        
        <Space wrap style={currentStyles.cardTags}>
          {prompt.tags.map(tag => (
            <Tag key={tag} size="small" color="blue">
              {tag}
            </Tag>
          ))}
        </Space>

        <div style={currentStyles.cardAiRecommend}>
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
          style={currentStyles.cardUsage}
        >
          {prompt.usage}
        </Paragraph>
      </div>

      <div style={currentStyles.cardActions}>
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

export default PromptCard; 
