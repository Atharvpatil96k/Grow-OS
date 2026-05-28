module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/backend/tests/**/*.test.js'],
  collectCoverageFrom: ['backend/**/*.js', '!backend/tests/**'],
  coverageDirectory: 'coverage',
  verbose: true,
};
