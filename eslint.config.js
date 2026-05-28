module.exports = {
  env: { node: true, es2021: true, jest: true },
  extends: ['airbnb-base'],
  parserOptions: { ecmaVersion: 'latest' },
  rules: {
    'no-console': 'warn',
    'consistent-return': 'off',
    'no-underscore-dangle': 'off',
    'import/no-dynamic-require': 'off',
    'global-require': 'off',
  },
};
