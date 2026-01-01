## Packages
chess.js | Chess logic library
react-chessboard | React component for the chess board
framer-motion | Animations for UI elements
clsx | Utility for constructing className strings conditionally
tailwind-merge | Utility for merging Tailwind CSS classes

## Notes
Stockfish AI will be loaded from a CDN in a Web Worker for single-player mode.
Real-time multiplayer will use WebSockets at `ws://window.location.host/ws`.
Glassmorphism design requires careful handling of backdrop-filter and transparency.
