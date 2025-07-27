import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'

import PromptPage from './pages/prompt'
import 'antd/dist/reset.css'
// import '@ant-design/pro-components/dist/components.css'
import './index.css'

createRoot(document.getElementById('root')).render(
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route path="/frontend" element={<PromptPage />} />
          <Route path="/backend" element={<PromptPage />} />
          <Route path="/ui-design" element={<PromptPage />} />
          <Route path="/programming-rules" element={<PromptPage />} />
          <Route path="/" element={<PromptPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
)
