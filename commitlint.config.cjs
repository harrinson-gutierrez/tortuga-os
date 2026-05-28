/**
 * commitlint config — Tortuga OS
 *
 * Conventions documented in docs/STANDARDS.md §3.7.
 *
 * To enable the hook (done once):
 *   pnpm add -Dw @commitlint/cli @commitlint/config-conventional husky lint-staged
 *   npx husky init
 *   echo 'pnpm exec commitlint --edit "$1"' > .husky/commit-msg
 *   echo 'pnpm exec lint-staged' > .husky/pre-commit
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'chore',
        'docs',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'style',
        'revert',
      ],
    ],
    'subject-case': [0], // allow flexible subject casing
    'subject-max-length': [2, 'always', 72],
    'header-max-length': [2, 'always', 100],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    'scope-case': [2, 'always', 'kebab-case'],
  },
}
