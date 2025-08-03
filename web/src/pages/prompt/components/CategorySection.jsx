import React from 'react';
import { Row, Col, Typography, Space } from 'antd';
import PromptCard from './PromptCard';

const { Title } = Typography;

const CategorySection = ({ category, onPreview, onCodePreview, onCopy, currentStyles, currentThemeColors }) => {
  console.log('CategorySection rendering:', category);
  
  return (
    <div style={currentStyles.categorySection}>
      <div style={currentStyles.categoryTitle}>
        <Title level={5} style={{ color: currentThemeColors[category.id] || category.color }}>
          <Space>
            {category.icon}
            {category.name}
          </Space>
        </Title>
      </div>

      <Row gutter={[16, 16]} wrap>
        {category.prompts && category.prompts.length > 0 ? (
          category.prompts.map(prompt => (
            <Col key={prompt.id} >
              <PromptCard
                prompt={prompt}
                onPreview={onPreview}
                onCodePreview={onCodePreview}
                onCopy={onCopy}
                currentStyles={currentStyles}
              />
            </Col>
          ))
        ) : (
          <Col span={24}>
            <p>该分类下暂无提示词</p>
          </Col>
        )}
      </Row>
    </div>
  );
};

export default CategorySection; 
