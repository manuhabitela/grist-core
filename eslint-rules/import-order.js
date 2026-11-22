// Re-exports only the import order rule. Loading eslint-plugin-import-x itself
// pulls in the eslint package, which this repo no longer runs.
const order = require("eslint-plugin-import-x/rules/order");

module.exports = {
  meta: {
    name: "@import-x",
  },
  rules: {
    order: order.default || order,
  },
};
