import React from 'react';
import { Row, Col, Typography, Space } from 'antd';
import PromptCard from './PromptCard';

const { Title } = Typography;

const CategorySection = ({ category, onPreview, onCopy, currentStyles, currentThemeColors }) => {
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
        {category.prompts.map(prompt => (
          <Col key={prompt.id} >
            <PromptCard
              prompt={prompt}
              onPreview={onPreview}
              onCopy={onCopy}
              currentStyles={currentStyles}
            />
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default CategorySection; 
