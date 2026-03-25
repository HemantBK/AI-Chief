/**
 * Chef Scientia - Main Application
 * Vanilla JS single-page app with hash-based routing.
 */

import { renderMessage, addUserMessage, showLoading, hideLoading } from './components/chat.js';
import { renderMetricCards, renderSafetyChart, renderCategoryChart, renderFlagsTable } from './components/dashboard.js';

// ============================================
// State
// ============================================
let dashboardInterval = null;

// ============================================
// Router
// ============================================
function getRoute() {
  const hash = window.location.hash.replace('#', '') || 'chat';
  return ['chat', 'dashboard'].includes(hash) ? hash : 'chat';
}

function navigate(route) {
  // Toggle views
  document.getElementById('view-chat').classList.toggle('hidden', route !== 'chat');
  document.getElementById('view-dashboard').classList.toggle('hidden', route !== 'dashboard');

  // Toggle active tab
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === route);
  });

  // Dashboard lifecycle
  if (route === 'dashboard') {
    loadDashboard();
    startDashboardRefresh();
  } else {
    stopDashboardRefresh();
  }
}

function initRouter() {
  window.addEventListener('hashchange', () => navigate(getRoute()));
  navigate(getRoute());
}

// ============================================
// Chat
// ============================================
function initChat() {
  const input = document.getElementById('question-input');
  const sendBtn = document.getElementById('send-btn');
  const chipsContainer = document.getElementById('example-chips');

  // Send on button click
  sendBtn.addEventListener('click', () => submitQuestion());

  // Keyboard: Enter to send, Shift+Enter for newline
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitQuestion();
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
  });

  // Example chips
  chipsContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    input.value = chip.dataset.question;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    input.focus();
  });
}

async function submitQuestion() {
  const input = document.getElementById('question-input');
  const question = input.value.trim();
  if (!question) return;

  const messagesEl = document.getElementById('chat-messages');
  const welcomeEl = document.getElementById('chat-welcome');

  // Hide welcome screen
  welcomeEl.classList.add('hidden');

  // Add user message
  messagesEl.insertAdjacentHTML('beforeend', addUserMessage(question));

  // Clear input
  input.value = '';
  input.style.height = 'auto';

  // Show loading
  showLoading();
  scrollToBottom();

  try {
    const response = await fetchAPI('/api/ask', {
      method: 'POST',
      body: JSON.stringify({ question }),
    });

    hideLoading();
    messagesEl.insertAdjacentHTML('beforeend', renderMessage(response));
  } catch (err) {
    hideLoading();
    // Show a friendly error as a chef message
    const errorResponse = {
      answer: `I'm sorry, I couldn't process your question right now. ${err.message || 'Please try again in a moment.'}`,
      safety_score: null,
      citations: [],
    };
    messagesEl.insertAdjacentHTML('beforeend', renderMessage(errorResponse));
    showErrorToast('Failed to get a response. The server may be unavailable.');
  }

  scrollToBottom();
}

function scrollToBottom() {
  const container = document.querySelector('.chat-container');
  if (container) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
}

// ============================================
// Dashboard
// ============================================
async function loadDashboard() {
  try {
    // Fetch all dashboard data in parallel
    const [metrics, trendData, flagsData] = await Promise.all([
      fetchAPI('/api/metrics').catch(() => null),
      fetchAPI('/api/metrics/safety-trend').catch(() => null),
      fetchAPI('/api/metrics/safety-flags').catch(() => null),
    ]);

    if (metrics) {
      renderMetricCards(metrics);

      // If metrics includes category distribution, use it
      const categories = metrics.categories || metrics.categoryDistribution || metrics.category_distribution;
      if (categories) {
        renderCategoryChart(categories);
      } else {
        // Provide sample data if not available
        renderCategoryChart({
          labels: ['Safety', 'Substitution', 'Technique', 'Chemistry', 'Storage', 'Other'],
          values: [0, 0, 0, 0, 0, 0],
        });
      }
    }

    if (trendData) {
      renderSafetyChart(trendData);
    } else {
      // Provide empty chart
      renderSafetyChart({ labels: [], values: [] });
    }

    if (flagsData) {
      const flags = Array.isArray(flagsData) ? flagsData : flagsData.flags || [];
      renderFlagsTable(flags);
    }
  } catch (err) {
    showErrorToast('Could not load dashboard data.');
  }
}

function startDashboardRefresh() {
  stopDashboardRefresh();
  dashboardInterval = setInterval(loadDashboard, 30000);
}

function stopDashboardRefresh() {
  if (dashboardInterval) {
    clearInterval(dashboardInterval);
    dashboardInterval = null;
  }
}

// ============================================
// API Helper
// ============================================
async function fetchAPI(url, options = {}) {
  const defaultOptions = {
    headers: { 'Content-Type': 'application/json' },
  };

  const mergedOptions = { ...defaultOptions, ...options };

  const response = await fetch(url, mergedOptions);

  if (!response.ok) {
    let errorMessage = `Server error (${response.status})`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(errorMessage);
  }

  const json = await response.json();

  // Auto-unwrap {success, data} envelope from our API
  if (json && json.success && json.data !== undefined) {
    return json.data;
  }
  return json;
}

// ============================================
// Error Toast
// ============================================
function showErrorToast(message) {
  // Remove existing toast
  const existing = document.querySelector('.error-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================
// Feedback
// ============================================
window.sendFeedback = async function(queryId, helpful, btnElement) {
  try {
    await fetchAPI('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ query_id: queryId, helpful }),
    });

    // Disable both buttons and highlight the chosen one
    const row = btnElement.closest('.feedback-row');
    if (row) {
      row.querySelectorAll('.feedback-btn').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.4';
      });
      btnElement.style.opacity = '1';
      btnElement.style.transform = 'scale(1.2)';

      const label = row.querySelector('.feedback-label');
      if (label) label.textContent = helpful ? 'Thanks! 🎉' : 'Thanks for the feedback';
    }
  } catch (err) {
    showErrorToast('Could not submit feedback');
  }
};

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initChat();
  initRouter();
});
