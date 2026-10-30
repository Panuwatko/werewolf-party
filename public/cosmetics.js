// Character options shared by the server (validation) and the page (picker).
(function (root) {
  const COSMETICS = {
    avatars: [
      '🧑‍🌾', '👩‍🍳', '🧙', '🧝', '🧚', '🥷', '🤠', '👮', '🧑‍⚕️', '🧑‍🎨', '👸', '🤴',
      '🧛', '👻', '🦊', '🐱', '🐶', '🐻', '🐼', '🐸', '🦉', '🐔', '🐰', '🦁',
    ],
    colors: {
      indigo: '#5b6cff',
      red: '#e0533f',
      amber: '#e6aa48',
      green: '#4fbf7f',
      teal: '#3bb6b0',
      sky: '#4aa3e8',
      violet: '#a07cf0',
      pink: '#e46aa8',
      brown: '#a97a52',
      slate: '#8a93a8',
    },
    mottoMax: 24,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = COSMETICS;
  else root.COSMETICS = COSMETICS;
})(this);
