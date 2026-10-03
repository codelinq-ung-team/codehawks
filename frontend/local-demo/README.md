# Local chatbot demo UI

These static files provide a small demo client for the Python backend.
Run `python -m backend.server` from the repository root, then open
http://127.0.0.1:8000. The server serves this directory and `POST /api/chat`
from the same origin.

`chat.js` consumes newline-delimited JSON text deltas as they arrive and stores
only completed replies in browser memory. `index.html` defines the page and
`style.css` its presentation. Markdown parsing is left to the frontend team.
See [the backend guide](../../backend/README.md) for setup and the API contract.
