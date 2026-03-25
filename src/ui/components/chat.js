/**
 * Chat component module for Chef Scientia.
 * Handles rendering of messages, citations, safety badges, and loading state.
 */

/**
 * Renders inline markdown-like formatting: bold, italic, line breaks, and lists.
 */
function formatText(text) {
  if (!text) return '';
  let html = text
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Line breaks (double newline = paragraph)
    .replace(/\n\n/g, '</p><p>')
    // Single newline = <br>
    .replace(/\n/g, '<br>');

  // Wrap in paragraph
  html = '<p>' + html + '</p>';

  // Simple list detection: lines starting with "- "
  html = html.replace(/<p>((?:- .*?(?:<br>|<\/p>))+)/g, (match) => {
    const items = match
      .replace(/<\/?p>/g, '')
      .split('<br>')
      .filter(line => line.trim().startsWith('- '))
      .map(line => `<li>${line.trim().slice(2)}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  });

  return html;
}

/**
 * Creates a safety badge element.
 * @param {number} score - Safety score between 0 and 1.
 * @returns {string} HTML string for the safety badge.
 */
export function renderSafetyBadge(score) {
  if (score == null) return '';

  let colorClass, label;
  if (score > 0.7) {
    colorClass = 'safety-green';
    label = 'High Confidence';
  } else if (score >= 0.4) {
    colorClass = 'safety-yellow';
    label = 'Moderate Confidence';
  } else {
    colorClass = 'safety-red';
    label = 'Low Confidence';
  }

  const displayScore = (score * 100).toFixed(0);

  return `
    <div class="safety-badge-wrapper">
      <div class="safety-badge ${colorClass}">
        <span class="score-circle">${displayScore}</span>
        <span>${label}</span>
      </div>
      <span class="safety-label">Safety Score</span>
    </div>
  `;
}

/**
 * Renders a single citation card.
 * @param {object} citation - Citation object with source_type, title, text, etc.
 * @returns {string} HTML string for the citation card.
 */
export function renderCitation(citation) {
  const sourceType = (citation.source_type || citation.sourceType || 'other').toUpperCase();
  const badgeClassMap = {
    USDA: 'badge-usda',
    FDA: 'badge-fda',
    PAPER: 'badge-paper',
    LECTURE: 'badge-lecture',
  };
  const badgeClass = badgeClassMap[sourceType] || 'badge-other';
  const title = citation.title || citation.source || 'Source';
  const text = citation.text || citation.excerpt || '';

  return `
    <div class="citation-card">
      <span class="citation-badge ${badgeClass}">${sourceType}</span>
      <div class="citation-text">
        <span class="citation-title">${escapeHtml(title)}</span>
        ${text ? `<br><span>${escapeHtml(truncate(text, 150))}</span>` : ''}
      </div>
    </div>
  `;
}

/**
 * Renders the full chef response message.
 * @param {object} response - API response with answer, safety_score, citations, conflict.
 * @returns {string} HTML string for the complete message.
 */
export function renderMessage(response) {
  const answer = response.answer || response.response || 'No response received.';
  const safetyScore = response.safety_score ?? response.safetyScore ?? null;
  const citations = response.citations || [];
  const conflict = response.conflict || response.conflict_warning || null;
  const queryId = response.query_id || '';

  let citationsHtml = '';
  if (citations.length > 0) {
    const citationCards = citations.map(c => renderCitation(c)).join('');
    citationsHtml = `
      <div class="citations-section">
        <button class="citations-toggle" onclick="this.classList.toggle('expanded'); this.nextElementSibling.classList.toggle('expanded');">
          <span class="toggle-arrow">&#9660;</span>
          ${citations.length} source${citations.length !== 1 ? 's' : ''} cited
        </button>
        <div class="citations-list">
          ${citationCards}
        </div>
      </div>
    `;
  }

  let conflictHtml = '';
  if (conflict) {
    const conflictText = typeof conflict === 'string' ? conflict : conflict.message || conflict.description || 'Conflicting information detected across sources.';
    conflictHtml = `
      <div class="conflict-warning">
        <span class="conflict-icon">&#9888;&#65039;</span>
        <div><strong>Source Conflict Detected:</strong> ${escapeHtml(conflictText)}</div>
      </div>
    `;
  }

  return `
    <div class="message message-chef">
      <div class="message-content">
        <div class="chef-header">
          <div class="chef-avatar">
            <img src="assets/chef-icon.svg" alt="">
          </div>
          <span class="chef-name">Chef Scientia</span>
        </div>
        <div class="message-bubble">
          ${formatText(answer)}
          ${conflictHtml}
          ${renderSafetyBadge(safetyScore)}
          ${citationsHtml}
          ${queryId ? `
          <div class="feedback-row" data-query-id="${escapeHtml(queryId)}">
            <span class="feedback-label">Was this helpful?</span>
            <button class="feedback-btn feedback-up" onclick="window.sendFeedback('${escapeHtml(queryId)}', true, this)" title="Helpful">👍</button>
            <button class="feedback-btn feedback-down" onclick="window.sendFeedback('${escapeHtml(queryId)}', false, this)" title="Not helpful">👎</button>
          </div>` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Adds a user question bubble to the chat.
 * @param {string} question - The user's question text.
 * @returns {string} HTML string for the user message.
 */
export function addUserMessage(question) {
  return `
    <div class="message message-user">
      <div class="message-bubble">${escapeHtml(question)}</div>
    </div>
  `;
}

/**
 * Shows the loading indicator.
 */
export function showLoading() {
  const el = document.getElementById('chat-loading');
  if (el) el.classList.remove('hidden');
}

/**
 * Hides the loading indicator.
 */
export function hideLoading() {
  const el = document.getElementById('chat-loading');
  if (el) el.classList.add('hidden');
}

// --- Utility helpers ---

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}
