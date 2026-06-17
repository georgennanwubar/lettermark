import nextPlugin from 'eslint-config-next';

const config = [
  ...nextPlugin,
  {
    ignores: ['drizzle/**'],
  },
];

export default config;
