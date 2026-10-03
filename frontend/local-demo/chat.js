const form = document.querySelector('#chat-form');
const input = document.querySelector('#message');
const transcript = document.querySelector('#transcript');
const send = document.querySelector('#send');
const reset = document.querySelector('#reset');
const status = document.querySelector('#status');
const error = document.querySelector('#error');
const starters = document.querySelector('#starters');
const greeting = transcript.firstElementChild.cloneNode(true);
let messages = [];
let busy = false;

function append(role, text) {
  const article = document.createElement('article');
  article.className = `message ${role}`;
  const label = document.createElement('span');
  label.className = 'speaker';
  label.textContent = role === 'user' ? 'You' : 'Codelinq';
  const content = document.createElement('p');
  content.textContent = text; // Provider output is text, never executable HTML.
  article.append(label, content);
  transcript.append(article);
  article.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return article;
}

function setBusy(value) {
  busy = value;
  input.disabled = value;
  send.disabled = value;
  reset.disabled = value;
  for (const button of starters.querySelectorAll('button')) button.disabled = value;
  status.textContent = value ? 'Reading your question and preparing a reply…' : '';
  transcript.setAttribute('aria-busy', String(value));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (busy || !text) return;
  error.hidden = true;
  // A failed request leaves history unchanged and the draft available to retry.
  const pending = [...messages, { role: 'user', content: text }];
  const encoded = JSON.stringify({ messages: pending, stream: true });
  if (pending.length > 40 || new TextEncoder().encode(encoded).length > 65536) {
    error.textContent = 'This conversation is too long. Start a new conversation with a brief summary.';
    error.hidden = false;
    return;
  }
  const userBubble = append('user', text);
  const assistantBubble = append('assistant', '');
  const content = assistantBubble.querySelector('p');
  let reply = '';
  setBusy(true);
  try {
    const response = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: encoded,
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Unable to send your question.');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let complete = false;
    function consume(line) {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.error) throw new Error(event.error);
      if (typeof event.delta === 'string') {
        reply += event.delta;
        content.textContent = reply;
        status.textContent = 'Writing reply…';
        transcript.scrollTop = transcript.scrollHeight;
      }
      if (event.done === true) complete = true;
    }
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          consume(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
        }
        if (done) break;
      }
      if (buffer.trim()) consume(buffer);
      if (!complete || !reply.trim()) throw new Error('The reply was interrupted. Please try again.');
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    messages = [...pending, { role: 'assistant', content: reply }];
    input.value = '';
    starters.hidden = true;
  } catch (failure) {
    userBubble.remove();
    assistantBubble.remove();
    error.textContent = failure.name === 'TimeoutError' ? 'The request timed out. Your draft is saved; try again.' : failure.message;
    error.hidden = false;
  } finally {
    setBusy(false);
    input.focus();
  }
});

for (const button of starters.querySelectorAll('button')) {
  button.addEventListener('click', () => {
    input.value = button.textContent;
    input.focus();
  });
}
reset.addEventListener('click', () => {
  if (busy) return;
  messages = [];
  transcript.replaceChildren(greeting.cloneNode(true));
  input.value = '';
  error.hidden = true;
  starters.hidden = false;
  input.focus();
});
