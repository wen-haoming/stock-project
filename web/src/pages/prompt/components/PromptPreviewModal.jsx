import React from 'react';
import { Modal, Button, Space, Typography, Divider, Tag, message } from 'antd';
import { CopyOutlined, RobotOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

const PromptPreviewModal = ({ visible, prompt, onClose, currentStyles }) => {
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
      style={currentStyles.previewModal}
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
        <div style={currentStyles.previewContent}>
          {prompt.content}
        </div>
      </div>
    </Modal>
  );
};

export default PromptPreviewModal; 
