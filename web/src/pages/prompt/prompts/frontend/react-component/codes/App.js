import React, { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  const increment = () => setCount(count + 1);
  const decrement = () => setCount(count - 1);

  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <h2>计数器组件</h2>
      <div style={{ fontSize: '24px', margin: '20px 0' }}>
        当前计数: {count}
      </div>
      <div>
        <button 
          onClick={decrement}
          style={{ 
            margin: '0 10px', 
            padding: '10px 20px',
            fontSize: '16px'
          }}
        >
          减少
        </button>
        <button 
          onClick={increment}
          style={{ 
            margin: '0 10px', 
            padding: '10px 20px',
            fontSize: '16px'
          }}
        >
          增加
        </button>
      </div>
    </div>
  );
}

export default Counter; 