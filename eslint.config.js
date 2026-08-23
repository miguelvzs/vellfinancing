const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    ignores: ['vendor/**', 'node_modules/**'],
  },
  {
    files: ['api/**/*.js', 'lib/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 2023,
      globals: { ...globals.node },
    },
  },
  {
    // js/*.js são scripts clássicos que compartilham um único escopo global
    // no browser (ver commit de split do index.html) e boa parte das funções
    // só é "usada" via atributo onclick="..." em string de template — o que
    // o ESLint não enxerga. no-undef/no-unused-vars dariam falso positivo
    // constante nesse padrão, então ficam desligadas aqui; a checagem real
    // de que todo handler existe é feita por script em test/.
    files: ['js/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2023,
      globals: { ...globals.browser, module: 'readonly' },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
];
