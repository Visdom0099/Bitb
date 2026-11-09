// GET /api/lists?email=you@gmail.com
const { handler, listLists } = require("../lib/bitb");

module.exports = handler({
  GET: q => listLists(q),
});
