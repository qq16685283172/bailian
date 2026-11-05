import React from 'react';
import { createRoot } from 'react-dom/client';
import './compat.js';
import App from './App';
import './styles.css';
import './polish.css';
import './home.css';
import './elder.css';
import './themes.css';

createRoot(document.getElementById('root')).render(<App />);
